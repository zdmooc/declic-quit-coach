import { describe, expect, it } from 'vitest';
import { genererCandidates } from './candidates';
import { rejouer, tableauDeBord, historiqueQuotidien } from './dashboard';
import type { DomainEvent } from './events';
import type { ContenuSante } from './milestones';
import { MOINS_UN_PAR_SEMAINE } from './reduction';
import type { ReferencePharma } from './substitutes';
import { zonedInstant } from './time';

const TZ = 'Europe/Paris';
const REF: ReferencePharma = { version: 't', validePar: 'Test', valideLe: '2026-10-23', oraux: [{ forme: 'gomme', maxParJour: 2 }] };
let seq = 0;
const ev = <T extends DomainEvent['type']>(
  type: T,
  quand: string,
  payload: Extract<DomainEvent, { type: T }>['payload'],
): DomainEvent =>
  ({ id: `e${String(++seq).padStart(4, '0')}`, type, schemaVersion: 1, occurredAt: new Date(Date.parse(quand)).toISOString(), tz: TZ, source: 'phone', payload }) as DomainEvent;

const profil = (n = 10): DomainEvent[] => [
  ev('ProfilCree', '2026-11-01T05:00:00Z', { cigarettesParJour: n, prixPaquetCents: 1000, cigarettesParPaquet: 20, lever: '07:00', coucher: '23:00' }),
  ev('PlanDemarre', '2026-11-01T05:00:01Z', { dateDebut: '2026-11-01', strategie: { kind: 'pas', pas: 1, periodeJours: 1 } }),
];

describe('projections du tableau de bord', () => {
  it('sans profil ou sans plan : rien', () => {
    expect(rejouer([])).toBeNull();
    expect(rejouer([profil()[0]!])).toBeNull();
  });

  it('applique horaires, rythme, prix, substituts et objectifs', () => {
    const etat = rejouer([
      ...profil(),
      ev('HorairesModifies', '2026-11-01T08:00:00Z', { lever: '08:00', coucher: '00:00' }),
      ev('RythmeModifie', '2026-11-01T08:00:00Z', { aPartirDu: '2026-11-03', strategie: MOINS_UN_PAR_SEMAINE }),
      ev('PrixModifie', '2026-11-01T08:00:00Z', { prixPaquetCents: 1200, cigarettesParPaquet: 20, aPartirDu: '2026-11-02' }),
      ev('PatchPose', '2026-11-01T08:00:00Z', { dosageMg: 1, dureePortHeures: 24 }),
      ev('PatchRetire', '2026-11-01T09:00:00Z', {}),
      ev('SubstitutOralPris', '2026-11-01T10:00:00Z', { forme: 'gomme', dosageMg: 1 }),
      ev('ObjectifEpargneDefini', '2026-11-01T10:00:00Z', { libelle: 'Vélo', montantCents: 40000 }),
      ev('ConsentementModifie', '2026-11-01T10:00:00Z', { finalite: 'notifications', accorde: true }),
    ])!;
    expect(etat.horaires).toEqual({ wake: '08:00', bed: '00:00' });
    expect(etat.plan.rythmes).toHaveLength(2);
    expect(etat.prix).toHaveLength(2);
    expect(etat.patch).toBeNull();
    expect(etat.oraux).toHaveLength(1);
    expect(etat.objectifs[0]!.libelle).toBe('Vélo');
    // Aucune cigarette : 10 × 0,50 € le 1er, puis 10 × 0,60 € le 2 (nouveau prix, RM-06).
    expect(historiqueQuotidien(etat, '2026-11-03', TZ).map((l) => l.economieCents)).toEqual([500, 600]);
  });

  it('suit le patch en cours, le maximum de gommes et l\'objectif d\'épargne', () => {
    const etat = rejouer([
      ...profil(),
      ev('PatchPose', '2026-11-03T07:00:00Z', { dosageMg: 1, dureePortHeures: 24 }),
      ev('SubstitutOralPris', '2026-11-03T08:00:00Z', { forme: 'gomme', dosageMg: 1 }),
      ev('SubstitutOralPris', '2026-11-03T09:00:00Z', { forme: 'gomme', dosageMg: 1 }),
      ev('ObjectifEpargneDefini', '2026-11-03T09:00:00Z', { libelle: 'Vélo', montantCents: 40000 }),
    ])!;
    const tdb = tableauDeBord(etat, Date.parse('2026-11-03T10:00:00Z'), TZ, REF);
    expect(tdb.patch.statut).toBe('porte');
    expect(tdb.oraux.find((o) => o.forme === 'gomme')).toMatchObject({ prisesAujourdhui: 2, maxAtteint: true });
    // 2 journées sans fumer à 10 cigarettes × 0,50 € = 5 € / jour.
    expect(tdb.objectifs[0]!.joursRestants).toBe(Math.ceil((40000 - tdb.economieTotaleCents) / 500));
    const textes = genererCandidates(etat, tdb, Date.parse('2026-11-03T10:00:00Z'), TZ, { version: 't', validePar: null, jalons: [] });
    expect(textes.find((c) => c.categorie === 'substitut')?.titre).toBe('Pense à changer ton patch');
  });

  it('phases : avant le début, arrêt puis maintien', () => {
    const etat = rejouer([...profil(2), ev('CigaretteFumee', '2026-11-02T08:00:00Z', {})])!;
    expect(tableauDeBord(etat, Date.parse('2026-10-30T10:00:00Z'), TZ, REF)).toMatchObject({ phase: 'avant-debut', economieJourCents: 0 });
    expect(tableauDeBord(etat, Date.parse('2026-11-04T10:00:00Z'), TZ, REF).phase).toBe('arret');
    expect(tableauDeBord(etat, Date.parse('2026-11-12T10:00:00Z'), TZ, REF).phase).toBe('maintien');
    const sansCigarette = rejouer(profil(1))!;
    expect(tableauDeBord(sansCigarette, Date.parse('2026-11-20T10:00:00Z'), TZ, REF)).toMatchObject({
      phase: 'maintien',
      depuisDerniereMinutes: null,
    });
  });

  it('RM-13 : un plan créé en fin de journée ne compte pas les heures d\'avant', () => {
    // Cas réel : 40 cigarettes par jour à 1 € pièce, plan créé à 18 h 41 (lever 7 h, coucher 23 h).
    const evs: DomainEvent[] = [
      ev('ProfilCree', '2026-11-02T17:41:00Z', { cigarettesParJour: 40, prixPaquetCents: 2000, cigarettesParPaquet: 20, lever: '07:00', coucher: '23:00' }),
      ev('PlanDemarre', '2026-11-02T17:41:00Z', { dateDebut: '2026-11-02', strategie: { kind: 'pas', pas: 1, periodeJours: 1 } }),
      ev('CigaretteFumee', '2026-11-02T17:41:30Z', {}),
    ];
    const etat = rejouer(evs)!;
    const t = (heure: string, jour = '2026-11-02') => zonedInstant(jour, heure, TZ);

    const a1845 = tableauDeBord(etat, t('18:45'), TZ, REF);
    expect(a1845.economieTotaleCents).toBe(0); // et non 28,40 €
    expect(a1845.quota).toBe(Math.ceil((40 * 259) / 960)); // 11 sur les 4 h 19 restantes
    expect(a1845.intervalleCibleMinutes).toBe(24); // le rythme du plan reste 16 h ÷ 40
    expect(a1845.prochaine).toMatchObject({ statut: 'attendre', a: Date.parse('2026-11-02T17:41:30Z') + 24 * 60_000 });
    expect(a1845.debutJournee).toBe(t('18:41'));

    // À 20 h : 79 min depuis la création → 40 × 79/960 − 1 = 2,29 cigarettes évitées.
    expect(tableauDeBord(etat, t('20:00'), TZ, REF).economieTotaleCents).toBe(229);

    // Le lendemain, la journée 0 terminée vaut 40 × 259/960 − 1 = 9,79 cigarettes évitées.
    expect(historiqueQuotidien(etat, '2026-11-03', TZ)).toEqual([{ jour: '2026-11-02', quota: 11, fumees: 1, economieCents: 979 }]);
    expect(tableauDeBord(etat, t('07:00', '2026-11-03'), TZ, REF).quota).toBe(39);
  });

  it('jalons santé : notifiés depuis la dernière cigarette', () => {
    const contenu: ContenuSante = { version: 't', validePar: 'Test', jalons: [{ id: '8h', heures: 8, message: 'M' }] };
    const etat = rejouer([...profil(), ev('CigaretteFumee', '2026-11-02T08:00:00Z', {})])!;
    const maintenant = Date.parse('2026-11-02T09:00:00Z');
    const tdb = tableauDeBord(etat, maintenant, TZ, REF);
    const sante = genererCandidates(etat, tdb, maintenant, TZ, contenu).find((c) => c.categorie === 'sante');
    expect(sante).toMatchObject({ titre: '8 h sans fumer', a: Date.parse('2026-11-02T16:00:00Z'), reportable: true });
  });

  it('candidates du matin : demain sans tabac si le quota tombe à zéro', () => {
    const etat = rejouer(profil(1))!;
    const maintenant = zonedInstant('2026-11-01', '12:00', TZ);
    const tdb = tableauDeBord(etat, maintenant, TZ, REF);
    const demain = genererCandidates(etat, tdb, maintenant, TZ, { version: 't', validePar: null, jalons: [] }).find(
      (c) => c.cle === 'plan-2026-11-02',
    );
    expect(demain?.titre).toBe('Journée sans tabac');
  });
});

import { describe, expect, it } from 'vitest';
import { genererCandidates } from './candidates';
import { historiqueQuotidien, proposerPlan, rejouer, tableauDeBord, type PropositionPlan } from './dashboard';
import type { ContexteCigarette, DomainEvent } from './events';
import type { ContenuSante } from './milestones';
import type { ReferencePharma } from './substitutes';
import { addMinutes, zonedInstant } from './time';

const TZ = 'Europe/Paris';
const REF: ReferencePharma = { version: 't', validePar: 'Test', valideLe: '2026-10-23', oraux: [{ forme: 'gomme', maxParJour: 2 }] };
const SANS_SANTE: ContenuSante = { version: 't', validePar: null, jalons: [] };
const t = (jour: string, heure: string) => zonedInstant(jour, heure, TZ);

let seq = 0;
function ev<T extends DomainEvent['type']>(type: T, a: number, payload: Extract<DomainEvent, { type: T }>['payload']): DomainEvent {
  return {
    id: `e${String(++seq).padStart(5, '0')}`,
    type,
    schemaVersion: 1,
    occurredAt: new Date(a).toISOString(),
    tz: TZ,
    source: 'phone',
    payload,
  } as DomainEvent;
}

const profil = (n: number, a: number, dejaFumeAujourdhui = false) =>
  ev('ProfilCree', a, { cigarettesParJour: n, prixPaquetCents: 1300, cigarettesParPaquet: 20, dejaFumeAujourdhui });

const plan = (p: PropositionPlan, a: number) => ev('PlanDemarre', a, { ...p, strategie: { kind: 'pas', pas: 1, periodeJours: 1 } });

/** Une journée type : 16 cigarettes de 7 h 30 à 22 h 30, une par heure. */
const journeeType = (jour: string, contextes: ContexteCigarette[] = ['cafe', 'travail', 'repas', 'stress']) =>
  Array.from({ length: 16 }, (_, i) => ev('CigaretteFumee', t(jour, '07:30') + i * 3_600_000, { contexte: contextes[i % contextes.length]! }));

const OBSERVATION = [profil(20, t('2026-11-02', '06:00')), ...journeeType('2026-11-02'), ...journeeType('2026-11-03'), ...journeeType('2026-11-04')];

describe('observation (RM-15)', () => {
  it('sans profil : rien ; profil seul : phase d\'observation sans quota ni économies', () => {
    expect(rejouer([], TZ)).toBeNull();
    const etat = rejouer([profil(20, t('2026-11-02', '06:00'))], TZ)!;
    const tdb = tableauDeBord(etat, t('2026-11-02', '09:00'), TZ, REF);
    expect(tdb).toMatchObject({
      phase: 'observation',
      quota: null,
      prochaine: { statut: 'disponible', depuis: null },
      sourceIntervalle: 'habitude',
      economieTotaleCents: 0,
      jourDuPlan: null,
    });
    expect(tdb.observation).toMatchObject({ joursMesures: 0, joursRequis: 3, terminee: false });
  });

  it('compte à rebours indicatif pendant l\'observation : recommandation de 60 min', () => {
    const evs = [profil(40, t('2026-11-02', '06:00')), ev('CigaretteFumee', t('2026-11-02', '08:00'), {})];
    const tdb = tableauDeBord(rejouer(evs, TZ)!, t('2026-11-02', '08:10'), TZ, REF);
    expect(tdb.prochaine).toEqual({ statut: 'attendre', a: t('2026-11-02', '09:00'), resteMinutes: 50 });
    expect(tdb.sourceIntervalle).toBe('habitude');
    // Aucune notification « prochaine cigarette » pendant l'observation.
    const c = genererCandidates(rejouer(evs, TZ)!, tdb, t('2026-11-02', '08:10'), TZ, SANS_SANTE);
    expect(c.some((x) => x.categorie === 'rythme')).toBe(false);
  });

  it('contextes personnels : libellé dans l\'analyse, ajout unique', () => {
    const evs = [
      profil(20, t('2026-11-02', '06:00')),
      ev('ContexteAjoute', t('2026-11-02', '08:00'), { cle: 'perso:volant', libelle: ' Au volant ' }),
      ev('ContexteAjoute', t('2026-11-02', '08:01'), { cle: 'perso:volant', libelle: 'Au volant' }),
      ev('CigaretteFumee', t('2026-11-02', '08:05'), { contexte: 'perso:volant' }),
    ];
    const tdb = tableauDeBord(rejouer(evs, TZ)!, t('2026-11-02', '09:00'), TZ, REF);
    expect(tdb.contextesPerso).toEqual([{ cle: 'perso:volant', libelle: 'Au volant' }]);
    expect(tdb.analyse.declencheurs[0]).toMatchObject({ contexte: 'perso:volant', libelle: 'Au volant', part: 1 });
  });

  it('après 3 journées : consommation, horaires et déclencheurs mesurés, plan proposé', () => {
    const etat = rejouer(OBSERVATION, TZ)!;
    const matin = tableauDeBord(etat, t('2026-11-05', '06:00'), TZ, REF);
    expect(matin.jour).toBe('2026-11-05');
    expect(matin.observation).toMatchObject({
      terminee: true,
      joursMesures: 3,
      habitudes: { cigarettesParJour: 16, debutHabituel: '07:30', finHabituelle: '22:30', dureeActiveMinutes: 900, intervalleMoyenMinutes: 60 },
      proposition: { referenceParJour: 16, quotaDepart: 15, debutHabituel: '07:30', finHabituelle: '22:30', dateDebut: '2026-11-05', origine: 'observation' },
    });
    expect(matin.intervalleMoyen7jMinutes).toBe(60);
    // 4 contextes à égalité : départage dans l'ordre de la liste des contextes.
    expect(matin.analyse.declencheurs.map((d) => d.contexte)).toEqual(['cafe', 'stress', 'repas']);
    expect(matin.analyse.heuresARisque).toHaveLength(3);
  });

  it('journée déjà entamée : le plan démarre la journée suivante', () => {
    const etat = rejouer([...OBSERVATION, ev('CigaretteFumee', t('2026-11-05', '07:35'), {})], TZ)!;
    expect(proposerPlan(etat, t('2026-11-05', '08:00'), TZ).proposition.dateDebut).toBe('2026-11-06');
  });

  it('« déjà fumé aujourd\'hui » : la journée d\'installation ne compte pas', () => {
    const evs = [profil(20, t('2026-11-02', '06:00'), true), ...OBSERVATION.slice(1)];
    expect(proposerPlan(rejouer(evs, TZ)!, t('2026-11-05', '06:00'), TZ)).toMatchObject({ joursMesures: 2, terminee: false });
  });

  it('notification quand le bilan d\'observation est prêt', () => {
    const etat = rejouer(OBSERVATION, TZ)!;
    const maintenant = t('2026-11-05', '06:00');
    const tdb = tableauDeBord(etat, maintenant, TZ, REF);
    expect(genererCandidates(etat, tdb, maintenant, TZ, SANS_SANTE).map((c) => c.cle)).toEqual(['observation-terminee']);
  });
});

describe('plan en cours', () => {
  const etatObs = rejouer(OBSERVATION, TZ)!;
  const proposition = proposerPlan(etatObs, t('2026-11-05', '06:00'), TZ).proposition;
  const debut = [...OBSERVATION, plan(proposition, t('2026-11-05', '06:00'))];

  it('quota, intervalle cible = durée active ÷ (quota − 1), prochaine cigarette', () => {
    const evs = [...debut, ev('CigaretteFumee', t('2026-11-05', '07:30'), {}), ev('CigaretteFumee', t('2026-11-05', '08:30'), {})];
    const tdb = tableauDeBord(rejouer(evs, TZ)!, t('2026-11-05', '09:00'), TZ, REF);
    expect(tdb).toMatchObject({ phase: 'reduction', jourDuPlan: 0, quota: 15, fumees: 2, restant: 13 });
    expect(tdb.intervalleCibleMinutes).toBeCloseTo(900 / 14);
    expect(tdb.prochaine?.statut).toBe('attendre');
    if (tdb.prochaine?.statut === 'attendre') expect(tdb.prochaine.a).toBeCloseTo(t('2026-11-05', '08:30') + (900 / 14) * 60_000);
    expect(tdb.intervalleMoyenJourMinutes).toBe(60);
    expect(tdb.economieTotaleCents).toBe(0); // 16 × 90/900 = 1,6 attendues, 2 fumées
  });

  it('le lendemain : quota − 1, économies de la veille par rapport à la référence mesurée', () => {
    const veille = Array.from({ length: 10 }, (_, i) => ev('CigaretteFumee', t('2026-11-05', '08:00') + i * 5_400_000, {}));
    const etat = rejouer([...debut, ...veille], TZ)!;
    const tdb = tableauDeBord(etat, t('2026-11-06', '06:30'), TZ, REF);
    expect(tdb).toMatchObject({ jour: '2026-11-06', jourDuPlan: 1, quota: 14, fumees: 0 });
    expect(historiqueQuotidien(etat, '2026-11-06')).toEqual([{ jour: '2026-11-05', quota: 15, fumees: 10, economieCents: 390 }]);
    expect(tdb.economieTotaleCents).toBe(390);
    expect(tdb.prochaine).toEqual({ statut: 'disponible', depuis: null });
  });

  it('couche-tard : une cigarette à 1 h 30 compte pour la veille', () => {
    const evs = [...debut, ev('CigaretteFumee', t('2026-11-05', '23:50'), {}), ev('CigaretteFumee', t('2026-11-06', '01:30'), {})];
    const tdb = tableauDeBord(rejouer(evs, TZ)!, t('2026-11-06', '01:45'), TZ, REF);
    expect(tdb).toMatchObject({ jour: '2026-11-05', fumees: 2, quota: 15 });
  });

  it('message du matin à l\'heure habituelle de la première cigarette', () => {
    const etat = rejouer(debut, TZ)!;
    const maintenant = t('2026-11-05', '06:00');
    const tdb = tableauDeBord(etat, maintenant, TZ, REF);
    const matin = genererCandidates(etat, tdb, maintenant, TZ, SANS_SANTE).find((c) => c.cle === 'plan-2026-11-05');
    expect(matin).toMatchObject({ a: t('2026-11-05', '07:30'), titre: 'Aujourd\'hui : 15 cigarettes maximum' });
  });

  it('RM-13 : démarrage immédiat en fin de journée déjà entamée', () => {
    const avant = Array.from({ length: 12 }, (_, i) => ev('CigaretteFumee', t('2026-11-02', '07:00') + i * 3_600_000, {}));
    const base = [profil(20, t('2026-11-02', '06:30')), ...avant];
    const etat0 = rejouer(base, TZ)!;
    const prop = proposerPlan(etat0, t('2026-11-02', '18:41'), TZ).proposition;
    expect(prop).toMatchObject({ origine: 'declaration', referenceParJour: 20, quotaDepart: 19, dateDebut: '2026-11-02' });
    const etat = rejouer([...base, plan(prop, t('2026-11-02', '18:41'))], TZ)!;
    const tdb = tableauDeBord(etat, t('2026-11-02', '18:45'), TZ, REF);
    // 701 min déjà écoulées sur 960 : il reste 27 % de la journée → 19 × 0,27 ≈ 5,1 → 6.
    expect(tdb).toMatchObject({ quota: 6, fumees: 0, jourDuPlan: 0 });
    expect(tdb.economieTotaleCents).toBe(Math.round(((20 * 4) / 960) * 65));
  });

  it('corrections : contexte et heure réelle d\'une cigarette', () => {
    const c = ev('CigaretteFumee', t('2026-11-05', '09:00'), {});
    const evs = [
      ...debut,
      c,
      ev('CigaretteCorrigee', t('2026-11-05', '09:01'), { evenementId: c.id, contexte: 'alcool' }),
      ev('CigaretteCorrigee', t('2026-11-05', '09:02'), { evenementId: c.id, occurredAt: new Date(t('2026-11-05', '08:40')).toISOString() }),
    ];
    const etat = rejouer(evs, TZ)!;
    expect(etat.cigarettes.at(-1)).toMatchObject({ id: c.id, a: t('2026-11-05', '08:40'), contexte: 'alcool' });
    expect(etat.derniereSaisieId).toBe(c.id);
  });

  it('substituts, objectif d\'épargne et rappel de patch', () => {
    const evs = [
      ...debut,
      ev('PatchPose', t('2026-11-05', '07:00'), { dosageMg: 1, dureePortHeures: 24 }),
      ev('CigaretteFumee', t('2026-11-05', '07:30'), {}),
      ev('SubstitutOralPris', t('2026-11-05', '08:00'), { forme: 'gomme', dosageMg: 1 }),
      ev('SubstitutOralPris', t('2026-11-05', '09:00'), { forme: 'gomme', dosageMg: 1 }),
      ev('EnvieResistee', t('2026-11-05', '09:30'), {}),
      ev('ObjectifEpargneDefini', t('2026-11-05', '09:30'), { libelle: 'Vélo', montantCents: 40000 }),
      ev('PrixModifie', t('2026-11-05', '09:30'), { prixPaquetCents: 1400, cigarettesParPaquet: 20, aPartirDu: '2026-12-01' }),
      ev('RythmeModifie', t('2026-11-05', '09:30'), { aPartirDu: '2026-11-10', strategie: { kind: 'pas', pas: 1, periodeJours: 7 } }),
      ev('PatchRetire', t('2026-11-05', '09:40'), {}),
      ev('PatchPose', t('2026-11-05', '09:45'), { dosageMg: 1, dureePortHeures: 24 }),
    ];
    const etat = rejouer(evs, TZ)!;
    const maintenant = t('2026-11-05', '10:00');
    const tdb = tableauDeBord(etat, maintenant, TZ, REF);
    expect(tdb.patch.statut).toBe('porte');
    expect(tdb.enviesResistees).toBe(1);
    expect(tdb.oraux.find((o) => o.forme === 'gomme')).toMatchObject({ prisesAujourdhui: 2, maxAtteint: true });
    expect(tdb.objectifs[0]!.joursRestants).toBe(Math.ceil((40000 - tdb.economieTotaleCents) / 65));
    expect(etat.plan!.input.rythmes).toHaveLength(2);
    const rappel = genererCandidates(etat, tdb, maintenant, TZ, SANS_SANTE).find((c) => c.categorie === 'substitut');
    expect(rappel?.titre).toBe('Pense à changer ton patch');
  });

  it('phases : avant le début, arrêt puis maintien', () => {
    const p2 = { ...proposition, referenceParJour: 2, quotaDepart: 1, dateDebut: '2026-11-06' };
    const evs = [...OBSERVATION, plan(p2, t('2026-11-05', '06:00')), ev('CigaretteFumee', t('2026-11-06', '08:00'), {})];
    const etat = rejouer(evs, TZ)!;
    expect(tableauDeBord(etat, t('2026-11-05', '10:00'), TZ, REF)).toMatchObject({ phase: 'avant-debut', economieJourCents: 0 });
    expect(tableauDeBord(etat, t('2026-11-07', '10:00'), TZ, REF)).toMatchObject({ phase: 'arret', quota: 0, prochaine: { statut: 'arret' } });
    expect(tableauDeBord(etat, t('2026-11-14', '10:00'), TZ, REF).phase).toBe('maintien');
  });

  it('jalons santé depuis la dernière cigarette (contenu validé)', () => {
    const contenu: ContenuSante = { version: 't', validePar: 'Test', jalons: [{ id: '8h', heures: 8, message: 'M' }] };
    const derniere = t('2026-11-05', '08:00');
    const etat = rejouer([...debut, ev('CigaretteFumee', derniere, {})], TZ)!;
    const maintenant = addMinutes(derniere, 60);
    const tdb = tableauDeBord(etat, maintenant, TZ, REF);
    const sante = genererCandidates(etat, tdb, maintenant, TZ, contenu).find((c) => c.categorie === 'sante');
    expect(sante).toMatchObject({ titre: '8 h sans fumer', a: addMinutes(derniere, 480), reportable: true });
  });
});

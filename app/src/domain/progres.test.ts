import { describe, expect, it } from 'vitest';
import { genererCandidates } from './candidates';
import { fauxPasAujourdhui, garde, messageDuSoir, messagePreventif, reponseGarde, resumeCoach } from './coach';
import { proposerPlan, rejouer, tableauDeBord, type JourneeHistorique } from './dashboard';
import type { DomainEvent } from './events';
import { progres, serieConsommation } from './progres';
import type { ReferencePharma } from './substitutes';
import { zonedInstant } from './time';

const TZ = 'Europe/Paris';
const REF: ReferencePharma = { version: 't', validePar: null, valideLe: null, oraux: [] };
const t = (jour: string, heure: string) => zonedInstant(jour, heure, TZ);

let seq = 0;
function ev<T extends DomainEvent['type']>(type: T, a: number, payload: Extract<DomainEvent, { type: T }>['payload']): DomainEvent {
  return { id: `p${String(++seq).padStart(5, '0')}`, type, schemaVersion: 1, occurredAt: new Date(a).toISOString(), tz: TZ, source: 'phone', payload } as DomainEvent;
}

/** `n` cigarettes à partir de 8 h, une toutes les heures, toutes « café ». */
const journee = (jour: string, n: number) =>
  Array.from({ length: n }, (_, i) => ev('CigaretteFumee', t(jour, '08:00') + i * 3_600_000, { contexte: 'cafe' }));

const profil = ev('ProfilCree', t('2026-11-02', '06:00'), { cigarettesParJour: 10, prixPaquetCents: 1300, cigarettesParPaquet: 20, dejaFumeAujourdhui: false });
const OBS = [profil, ...journee('2026-11-02', 10), ...journee('2026-11-03', 10), ...journee('2026-11-04', 10)];

function avecPlan(extra: DomainEvent[]) {
  const etat0 = rejouer(OBS, TZ)!;
  const prop = proposerPlan(etat0, t('2026-11-05', '06:00'), TZ).proposition;
  return [...OBS, ev('PlanDemarre', t('2026-11-05', '06:00'), { ...prop, strategie: { kind: 'pas', pas: 1, periodeJours: 1 } }), ...extra];
}

describe('progrès (F5.6, F6.7, F2.4)', () => {
  it('records, bilan de la semaine et courbe du plan', () => {
    // Plan : référence 10, quota 9 le 5, 8 le 6 ; on fume 9 puis 6.
    const evs = avecPlan([...journee('2026-11-05', 9), ...journee('2026-11-06', 6)]);
    const etat = rejouer(evs, TZ)!;
    const p = progres(etat, t('2026-11-07', '07:00'), TZ);
    expect(p.reference).toBe(10);
    expect(p.records.cigarettesEvitees).toBe(1 + 4);
    expect(p.records.meilleureJournee).toEqual({ jour: '2026-11-06', fumees: 6 });
    expect(p.records.serieQuotaTenu).toBe(2);
    expect(p.bilanSemaine).toMatchObject({ jours: 5, fumees: 45, evitees: 5, declencheur: 'Café' });
    expect(p.courbe[0]).toEqual({ jour: '2026-11-05', quota: 9, fumees: 9 });
    expect(p.courbe.at(-1)?.quota).toBe(0);
    expect(p.dateDuZero).toBe(p.courbe.at(-1)?.jour);
    expect(p.courbe.find((c) => c.jour === '2026-11-08')?.fumees).toBeNull();
  });

  it('jours sans tabac depuis la dernière cigarette', () => {
    const etat = rejouer(OBS, TZ)!;
    expect(progres(etat, t('2026-11-07', '18:00'), TZ).records.joursSansTabac).toBe(3); // dernière : le 4 à 17 h
  });

  it('objectif d\'épargne : redéfini par libellé, puis retiré', () => {
    const evs = [
      profil,
      ev('ObjectifEpargneDefini', t('2026-11-02', '07:00'), { libelle: 'Vélo', montantCents: 40000 }),
      ev('ObjectifEpargneDefini', t('2026-11-02', '07:01'), { libelle: 'Vélo', montantCents: 50000 }),
      ev('ObjectifEpargneDefini', t('2026-11-02', '07:02'), { libelle: 'Voyage', montantCents: 90000 }),
      ev('ObjectifRetire', t('2026-11-02', '07:03'), { libelle: 'Voyage' }),
    ];
    expect(rejouer(evs, TZ)!.objectifs).toEqual([{ libelle: 'Vélo', montantCents: 50000 }]);
  });
});

describe('coach scripté (F6.8, F7.3, F7.4)', () => {
  it('bilan du soir : quota tenu, puis journée difficile, sans culpabiliser', () => {
    const tenu = rejouer(avecPlan(journee('2026-11-05', 8)), TZ)!;
    const tdb = tableauDeBord(tenu, t('2026-11-05', '22:00'), TZ, REF);
    const m = messageDuSoir(tdb, progres(tenu, t('2026-11-05', '22:00'), TZ));
    expect(m.titre).toBe('Quota tenu, bravo');
    expect(m.texte).toContain('Demain : 8 maximum');

    const dur = rejouer(avecPlan(journee('2026-11-05', 12)), TZ)!;
    const m2 = messageDuSoir(tableauDeBord(dur, t('2026-11-05', '22:00'), TZ, REF), progres(dur, t('2026-11-05', '22:00'), TZ));
    expect(m2.titre).toContain('difficile');
    expect(m2.texte).not.toMatch(/échec|nul|honte/i);
  });

  it('faux pas après l\'arrêt : message bienveillant, économies conservées', () => {
    // Plan déclaratif à 1 cigarette : quota 0 dès le premier jour.
    const evs = [
      ev('ProfilCree', t('2026-11-02', '06:00'), { cigarettesParJour: 1, prixPaquetCents: 1300, cigarettesParPaquet: 20, dejaFumeAujourdhui: false }),
      ev('PlanDemarre', t('2026-11-02', '06:00'), { dateDebut: '2026-11-02', strategie: { kind: 'pas', pas: 1, periodeJours: 1 }, referenceParJour: 1, quotaDepart: 0, debutHabituel: '08:00', finHabituelle: '22:00', origine: 'declaration' }),
      ev('CigaretteFumee', t('2026-11-04', '12:00'), { contexte: 'alcool' }),
    ];
    const etat = rejouer(evs, TZ)!;
    const tdb = tableauDeBord(etat, t('2026-11-04', '20:00'), TZ, REF);
    expect(fauxPasAujourdhui(tdb)).toBe(true);
    const m = messageDuSoir(tdb, progres(etat, t('2026-11-04', '20:00'), TZ));
    expect(m.titre).toBe('Un faux pas n’efface rien');
    expect(m.texte).toContain('Alcool');
  });

  it('notifications préventive (heure à risque) et bilan du soir pendant le plan', () => {
    const etat = rejouer(avecPlan([]), TZ)!;
    const tdb = tableauDeBord(etat, t('2026-11-05', '06:30'), TZ, REF);
    expect(messagePreventif(tdb)?.titre).toBe('Bientôt 8 h, ton moment sensible');
    const cles = genererCandidates(etat, tdb, t('2026-11-05', '06:30'), TZ, { version: 't', validePar: null, jalons: [] }).map((c) => c.cle);
    expect(cles).toContain('preventif-2026-11-05');
    expect(cles).toContain('soir-2026-11-05');
  });

  it('journée sans tabac après l\'arrêt : message de soutien', () => {
    const evs = [
      ev('ProfilCree', t('2026-11-02', '06:00'), { cigarettesParJour: 1, prixPaquetCents: 1300, cigarettesParPaquet: 20, dejaFumeAujourdhui: false }),
      ev('PlanDemarre', t('2026-11-02', '06:00'), { dateDebut: '2026-11-02', strategie: { kind: 'pas', pas: 1, periodeJours: 1 }, referenceParJour: 1, quotaDepart: 0, debutHabituel: '08:00', finHabituelle: '22:00', origine: 'declaration' }),
    ];
    const etat = rejouer(evs, TZ)!;
    const m = messageDuSoir(tableauDeBord(etat, t('2026-11-05', '21:00'), TZ, REF), progres(etat, t('2026-11-05', '21:00'), TZ));
    expect(m.titre).toBe('Une journée sans tabac de plus');
    expect(m.texte).toContain('3 jours sans cigarette');
  });

  it('réponses fixes des garde-fous : numéros d\'urgence et refus de dosage', () => {
    expect(reponseGarde('detresse')).toContain('3114');
    expect(reponseGarde('symptome')).toContain('15');
    expect(reponseGarde('dosage')).toContain('39 89');
  });

  it('garde-fous : détresse, symptôme et dosage détectés avant l\'IA', () => {
    expect(garde('J’ai envie d’en finir')).toBe('detresse');
    expect(garde('j’ai mal à la poitrine depuis ce matin')).toBe('symptome');
    expect(garde('je peux mettre deux patchs ?')).toBe('dosage');
    expect(garde('Quelle dose de pastilles ?')).toBe('dosage');
    expect(garde('Je meurs d’envie d’une cigarette après le café')).toBeNull();
  });

  it('résumé envoyé à l\'IA : chiffres seulement, aucun horodatage ni texte libre', () => {
    const etat = rejouer(avecPlan(journee('2026-11-05', 3)), TZ)!;
    const r = resumeCoach(tableauDeBord(etat, t('2026-11-05', '12:00'), TZ, REF), progres(etat, t('2026-11-05', '12:00'), TZ));
    expect(r).toMatchObject({ phase: 'reduction', quotaDuJour: 9, fumeesAujourdhui: 3, declencheurPrincipal: 'Café' });
    expect(JSON.stringify(r)).not.toMatch(/2026|T\d\d:/);
  });
});

describe('séries du graphique (jour, semaine, mois)', () => {
  const j = (jour: string, total: number, quota: number | null = null): JourneeHistorique => ({
    jour, total, fumees: total, quota, enPlan: quota !== null, sansHeure: 0, enviesSignalees: 0, envies: 0,
    intervalleMinutes: null, respectees: 0, nonRespectees: 0, economieCents: null, cigarettes: [], patchs: [],
    sousPatch: 0,
  });
  const hist = [j('2026-10-23', 8), j('2026-10-24', 11), j('2026-10-25', 11, 30), j('2026-10-26', 20, 38), j('2026-11-02', 10, 31)];

  it('par jour : total réel, journée en cours et journées partielles marquées incomplètes', () => {
    const s = serieConsommation(hist, 'jour', { aujourdhui: '2026-11-02', partielles: new Set(['2026-10-23']) });
    expect(s.map((p) => [p.debut, p.total, p.incomplet])).toEqual([
      ['2026-10-23', 8, true], ['2026-10-24', 11, false], ['2026-10-25', 11, false], ['2026-10-26', 20, false], ['2026-11-02', 10, true],
    ]);
  });

  it('par semaine ISO (lundi) : total, moyenne par journée renseignée, quota moyen', () => {
    const s = serieConsommation(hist, 'semaine', { aujourdhui: '2026-11-03' });
    expect(s.map((p) => [p.debut, p.total, p.jours, p.moyenneParJour, p.quotaMoyen])).toEqual([
      ['2026-10-19', 30, 3, 10, 30],
      ['2026-10-26', 20, 1, 20, 38],
      ['2026-11-02', 10, 1, 10, 31],
    ]);
  });

  it('par mois', () => {
    const s = serieConsommation(hist, 'mois', { aujourdhui: '2026-11-03' });
    expect(s.map((p) => [p.debut, p.total, p.jours])).toEqual([['2026-10-01', 50, 4], ['2026-11-01', 10, 1]]);
  });
});

describe('techniques de respiration du SOS', () => {
  it('consigne au fil du cycle et bilan : la plus efficace d’abord, ancien « respiration » = cohérence', async () => {
    const { TECHNIQUES, phaseA, bilanTechniques } = await import('./respiration');
    const soupir = TECHNIQUES.find((t) => t.cle === 'soupir')!;
    expect([0, 2500, 4000, 9500].map((ms) => phaseA(soupir, ms).consigne)).toEqual(['Inspire…', 'Encore un peu…', 'Expire lentement…', 'Inspire…']);
    const b = bilanTechniques(
      [{ strategie: 'respiration' }, { strategie: 'soupir' }, { strategie: 'soupir' }, {}],
      [{ technique: 'coherence' }, { technique: 'carree' }, {}],
    );
    expect(b.map((x) => [x.cle, x.resistees, x.sansIssue])).toEqual([
      ['soupir', 2, 0],
      ['coherence', 1, 1],
      ['carree', 0, 1],
    ]);
  });
});

describe('moyenne en direct', () => {
  it('inclut la pause en cours, sauf au-delà du seuil de nuit', async () => {
    const { moyenneEnDirect } = await import('./sessions');
    const t0 = 0;
    expect(moyenneEnDirect([20, 40], t0, t0 + 60 * 60_000)).toBe(40);
    expect(moyenneEnDirect([20, 40], t0, t0 + 10 * 60 * 60_000)).toBe(30);
    expect(moyenneEnDirect([], t0, t0 + 15 * 60_000)).toBe(15);
  });
});

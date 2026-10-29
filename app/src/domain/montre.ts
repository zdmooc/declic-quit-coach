/**
 * Données de la montre et des capteurs (RM-27), lues dans Health Connect (Zepp, Dexcom, RENPHO…).
 * Elles ne sont PAS enregistrées dans le journal : lues à la demande, elles restent sur le téléphone
 * et ne partent jamais vers le coach IA. Projection pure : croisement avec les cigarettes.
 */

import type { EtatJournal } from './dashboard';
import { addDays, localDateOf, minutesOfDay, type Instant, type LocalDate } from './time';

export interface DonneesMontre {
  luLe: Instant;
  sommeils: { debut: Instant; fin: Instant; phases?: PhasesSommeil }[];
  frequence: { a: Instant; bpm: number }[];
  repos: { a: Instant; bpm: number }[];
  hrv: { a: Instant; ms: number }[];
  pas: { debut: Instant; fin: Instant; n: number }[];
  spo2: { a: Instant; pct: number }[];
  glucose: { a: Instant; mgdl: number }[];
  tension: { a: Instant; sys: number; dia: number }[];
  poids: { a: Instant; kg: number }[];
}

/** Minutes par phase (Health Connect : profond, paradoxal/REM, léger, éveillé). */
export interface PhasesSommeil {
  profond: number;
  paradoxal: number;
  leger: number;
  eveil: number;
}

export const MONTRE_VIDE = (luLe: Instant): DonneesMontre => ({
  luLe,
  sommeils: [],
  frequence: [],
  repos: [],
  hrv: [],
  pas: [],
  spo2: [],
  glucose: [],
  tension: [],
  poids: [],
});

export interface JourMontre {
  jour: LocalDate;
  /** Fin du sommeil principal terminé ce jour-là. */
  reveil: Instant | null;
  sommeilMinutes: number | null;
  /** Début du sommeil principal (coucher). */
  coucher: Instant | null;
  phases: PhasesSommeil | null;
  /** Sommeil réparateur = profond + paradoxal (minutes, et part du temps endormi). */
  reparateurMinutes: number | null;
  reparateurPct: number | null;
  /** Dernière cigarette / dernière boisson caféinée → coucher (minutes ; 12 h avant au plus). */
  cigaretteAvantCoucher: number | null;
  cafeAvantCoucher: number | null;
  /** Réveil → première cigarette de la journée (minutes) ; `null` si inconnu. */
  delaiPremiereMinutes: number | null;
  /** Première cigarette notée avant la fin du sommeil mesuré par la montre (réveil non détecté). */
  premiereAvantReveil: boolean;
  /** Première cigarette de la journée, si elle existe. */
  premiere: Instant | null;
  frequenceRepos: number | null;
  hrvMs: number | null;
  pas: number | null;
  spo2: number | null;
  glucose: { moyenne: number; min: number; max: number } | null;
}

export interface AnalyseMontre {
  jours: JourMontre[];
  /** Fréquence cardiaque moyenne 30 min avant / 30 min après une cigarette (14 jours). */
  effetCigarette: { avant: number; apres: number; cigarettes: number } | null;
  derniereTension: { a: Instant; sys: number; dia: number } | null;
  dernierPoids: { a: Instant; kg: number } | null;
  sources: string[];
}

const moy = (xs: readonly number[]) => (xs.length === 0 ? null : xs.reduce((s, x) => s + x, 0) / xs.length);
const DEMI_HEURE = 30 * 60_000;

/** Premier indice dont l'instant est ≥ `t` (tableau trié croissant). */
function borneInf(xs: readonly number[], t: number): number {
  let bas = 0;
  let haut = xs.length;
  while (bas < haut) {
    const m = (bas + haut) >> 1;
    if (xs[m]! < t) bas = m + 1;
    else haut = m;
  }
  return bas;
}

export function analyserMontre(etat: EtatJournal, d: DonneesMontre, aujourdhui: LocalDate, tz: string, nbJours = 14): AnalyseMontre {
  const dates = Array.from({ length: nbJours }, (_, i) => addDays(aujourdhui, i - nbJours + 1));
  // Jour local mémorisé par heure : des dizaines de milliers de mesures, mais quelques centaines d'heures.
  const parHeure = new Map<number, LocalDate>();
  const jourDe = (a: Instant) => {
    const h = Math.floor(a / 3_600_000);
    let j = parHeure.get(h);
    if (j === undefined) parHeure.set(h, (j = localDateOf(a, tz)));
    return j;
  };
  const grouper = <T,>(xs: readonly T[], instant: (x: T) => Instant) => {
    const m = new Map<LocalDate, T[]>();
    for (const x of xs) {
      const k = jourDe(instant(x));
      const l = m.get(k);
      if (l) l.push(x);
      else m.set(k, [x]);
    }
    return (j: LocalDate) => m.get(j) ?? [];
  };
  const sommeilsDu = grouper(d.sommeils, (x) => x.fin);
  const glucoseDu = grouper(d.glucose, (x) => x.a);
  const reposDu = grouper(d.repos, (x) => x.a);
  const hrvDu = grouper(d.hrv, (x) => x.a);
  const spo2Du = grouper(d.spo2, (x) => x.a);
  const pasDu = grouper(d.pas, (x) => x.debut);
  const premiereDu = new Map<LocalDate, Instant>();
  for (const c of etat.cigarettes) if (!premiereDu.has(c.jour) || c.a < premiereDu.get(c.jour)!) premiereDu.set(c.jour, c.a);
  const instantsCigarettes = etat.cigarettes.map((c) => c.a).sort((a, b) => a - b);
  const instantsCafe = (etat.boissons ?? []).filter((b) => b.boisson !== 'deca').map((b) => b.a).sort((a, b) => a - b);

  const jours = dates.map((jour): JourMontre => {
    // Sommeil principal : la plus longue session qui se termine ce jour-là.
    // (une session avec phases — la montre — passe avant une session sans détail, le téléphone par exemple).
    const s = [...sommeilsDu(jour)].sort((a, b) => Number(Boolean(b.phases)) - Number(Boolean(a.phases)) || b.fin - b.debut - (a.fin - a.debut))[0];
    const ph = s?.phases ?? null;
    const endormi = ph ? ph.profond + ph.paradoxal + ph.leger : null;
    // Dernier instant ≤ coucher, dans les 12 h qui précèdent.
    const avant = (instants: readonly number[]) => {
      if (!s) return null;
      const i = borneInf(instants, s.debut + 1) - 1;
      if (i < 0 || s.debut - instants[i]! > 12 * 3_600_000) return null;
      return Math.round((s.debut - instants[i]!) / 60_000);
    };
    const p = premiereDu.get(jour);
    const premiere = p === undefined ? undefined : { a: p };
    const glu = glucoseDu(jour).map((x) => x.mgdl);
    const pas = pasDu(jour).reduce((t, x) => t + x.n, 0);
    const repos = reposDu(jour).map((x) => x.bpm);
    return {
      jour,
      reveil: s?.fin ?? null,
      sommeilMinutes: s ? Math.round((s.fin - s.debut) / 60_000) : null,
      coucher: s?.debut ?? null,
      phases: ph,
      reparateurMinutes: ph ? ph.profond + ph.paradoxal : null,
      reparateurPct: ph && endormi ? ((ph.profond + ph.paradoxal) / endormi) * 100 : null,
      cigaretteAvantCoucher: avant(instantsCigarettes),
      cafeAvantCoucher: avant(instantsCafe),
      delaiPremiereMinutes: s && premiere && premiere.a >= s.fin ? Math.round((premiere.a - s.fin) / 60_000) : null,
      premiereAvantReveil: Boolean(s && premiere && premiere.a < s.fin),
      premiere: premiere?.a ?? null,
      frequenceRepos: repos.length ? Math.min(...repos) : null,
      hrvMs: moy(hrvDu(jour).map((x) => x.ms)),
      pas: pas > 0 ? pas : null,
      spo2: moy(spo2Du(jour).map((x) => x.pct)),
      glucose: glu.length ? { moyenne: moy(glu)!, min: Math.min(...glu), max: Math.max(...glu) } : null,
    };
  });

  // Effet d'une cigarette sur le cœur : seulement si des mesures existent avant ET après.
  // Mesures triées une fois, puis fenêtres trouvées par dichotomie (et non en reparcourant tout).
  const debut = Math.min(...dates.map((j) => Date.parse(`${j}T00:00:00Z`))) - 86_400_000;
  const freq = [...d.frequence].sort((a, b) => a.a - b.a);
  const tFreq = freq.map((f) => f.a);
  const moyenneEntre = (de: number, a: number) => {
    let somme = 0;
    let nb = 0;
    for (let i = borneInf(tFreq, de); i < freq.length && tFreq[i]! < a; i++) {
      somme += freq[i]!.bpm;
      nb++;
    }
    return nb ? somme / nb : null;
  };
  const avant: number[] = [];
  const apres: number[] = [];
  let n = 0;
  for (const c of etat.cigarettes) {
    if (c.a < debut) continue;
    const av = moyenneEntre(c.a - DEMI_HEURE, c.a);
    const ap = moyenneEntre(c.a, c.a + DEMI_HEURE);
    if (av !== null && ap !== null) {
      avant.push(av);
      apres.push(ap);
      n++;
    }
  }
  const dernier = <T extends { a: Instant }>(xs: readonly T[]) => [...xs].sort((a, b) => b.a - a.a)[0] ?? null;
  const sources = [
    d.sommeils.length && 'sommeil',
    d.frequence.length && 'fréquence cardiaque',
    d.repos.length && 'fréquence au repos',
    d.hrv.length && 'HRV',
    d.pas.length && 'pas',
    d.spo2.length && 'SpO2',
    d.glucose.length && 'glycémie',
    d.tension.length && 'tension',
    d.poids.length && 'poids',
  ].filter((x): x is string => typeof x === 'string');
  return {
    jours,
    effetCigarette: n === 0 ? null : { avant: moy(avant)!, apres: moy(apres)!, cigarettes: n },
    derniereTension: dernier(d.tension),
    dernierPoids: dernier(d.poids),
    sources,
  };
}

export interface PisteSommeil {
  titre: string;
  detail: string;
  /** Comparaison mesurée sur tes nuits, si assez de données. */
  mesure?: string;
}

const moyenne = (xs: readonly number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
const fmt = (m: number) => (m < 60 ? `${Math.round(m)} min` : `${Math.floor(m / 60)} h ${String(Math.round(m % 60)).padStart(2, '0')}`);

/** Compare le sommeil réparateur des nuits qui respectent un seuil et des autres (2 nuits au moins de chaque côté). */
function comparer(jours: readonly JourMontre[], valeur: (j: JourMontre) => number | null, seuil: number, libelle: [string, string]): string | undefined {
  const avec = jours.filter((j) => j.reparateurPct !== null && valeur(j) !== null);
  const ok = avec.filter((j) => valeur(j)! >= seuil).map((j) => j.reparateurPct!);
  const ko = avec.filter((j) => valeur(j)! < seuil).map((j) => j.reparateurPct!);
  if (ok.length < 2 || ko.length < 2) return undefined;
  return `Sommeil réparateur : ${Math.round(moyenne(ok))} % ${libelle[0]} (${ok.length} nuits), ${Math.round(moyenne(ko))} % ${libelle[1]} (${ko.length} nuits).`;
}

/**
 * Pistes pour un sommeil plus réparateur, tirées de TES nuits (tabac, caféine, régularité, éveils).
 * Repères généraux : la nicotine et la caféine sont des stimulants ; la caféine agit plusieurs heures.
 */
export function pistesSommeil(jours: readonly JourMontre[], tz: string): PisteSommeil[] {
  const nuits = jours.filter((j) => j.sommeilMinutes !== null);
  if (nuits.length === 0) return [];
  const pistes: PisteSommeil[] = [];

  const cig = nuits.map((j) => j.cigaretteAvantCoucher).filter((x): x is number => x !== null);
  if (cig.length > 0 && moyenne(cig) < 90) {
    const mesure = comparer(nuits, (j) => j.cigaretteAvantCoucher, 90, ['quand la dernière cigarette est à 1 h 30 ou plus du coucher', 'sinon']);
    pistes.push({
      titre: 'Dernière cigarette au moins 1 h 30 avant de dormir',
      detail: `Ta dernière cigarette arrive en moyenne ${fmt(moyenne(cig))} avant le coucher. La nicotine est un stimulant : elle retarde l’endormissement et allège le sommeil. Avance-la, et mets une parade à la place (tisane, douche, lecture).`,
      ...(mesure ? { mesure } : {}),
    });
  }

  const cafe = nuits.map((j) => j.cafeAvantCoucher).filter((x): x is number => x !== null);
  if (cafe.some((x) => x < 8 * 60)) {
    const mesure = comparer(nuits, (j) => j.cafeAvantCoucher ?? 24 * 60, 8 * 60, ['sans caféine dans les 8 h avant le coucher', 'avec']);
    pistes.push({
      titre: 'Pas de caféine dans les 8 h avant le coucher',
      detail: 'La caféine agit plusieurs heures. Passe au déca ou à une infusion l’après-midi.',
      ...(mesure ? { mesure } : {}),
    });
  }

  const couchers = nuits.map((j) => j.coucher).filter((x): x is number => x !== null);
  if (couchers.length >= 3) {
    // Minutes depuis midi, pour qu'un coucher à 23 h 30 et un à 0 h 30 soient proches.
    const m = couchers.map((c) => (minutesOfDay(c, tz) + 12 * 60) % (24 * 60));
    const moy = moyenne(m);
    const ecart = Math.sqrt(moyenne(m.map((x) => (x - moy) ** 2)));
    if (ecart > 45)
      pistes.push({
        titre: 'Se coucher à heure fixe',
        detail: `Ton heure de coucher varie de ± ${fmt(ecart)}. Un horaire régulier, même le week-end, rend le sommeil plus profond.`,
      });
  }

  const eveils = nuits.map((j) => j.phases?.eveil).filter((x): x is number => x !== undefined);
  if (eveils.length > 0 && moyenne(eveils) > 30)
    pistes.push({
      titre: 'Moins d’éveils dans la nuit',
      detail: `Tu passes en moyenne ${fmt(moyenne(eveils))} éveillé par nuit. Chambre fraîche et sombre, pas d’écran au lit, pas d’alcool le soir. Si tu te réveilles avec une envie de fumer, c’est aussi un signe de manque : à noter.`,
    });

  const duree = moyenne(nuits.map((j) => j.sommeilMinutes!));
  if (duree < 7 * 60)
    pistes.push({ titre: 'Dormir plus longtemps', detail: `Tu dors en moyenne ${fmt(duree)} : la plupart des adultes ont besoin de 7 à 9 h.` });

  const rep = nuits.map((j) => j.reparateurPct).filter((x): x is number => x !== null);
  if (rep.length > 0 && moyenne(rep) < 35)
    pistes.push({
      titre: 'Activité physique dans la journée',
      detail: 'Marcher ou bouger en journée (pas le soir tard) augmente le sommeil profond. Ton sommeil réparateur est sous les repères habituels.',
    });
  return pistes;
}

export type VerdictSommeil = 'bien' | 'limite' | 'ameliorer';

/** Repère indicatif : profond + paradoxal ≈ 35 à 45 % de la nuit chez l'adulte. */
export const verdictReparateur = (pct: number): VerdictSommeil => (pct >= 35 ? 'bien' : pct >= 30 ? 'limite' : 'ameliorer');

export interface SemaineSommeil {
  lundi: LocalDate;
  nuits: number;
  pct: number;
  minutes: number;
  verdict: VerdictSommeil;
}

/** Moyenne du sommeil réparateur par semaine (lundi), des plus anciennes à la semaine en cours. */
export function semainesReparateur(jours: readonly JourMontre[]): SemaineSommeil[] {
  const lundi = (j: LocalDate) => addDays(j, -((new Date(`${j}T12:00:00Z`).getUTCDay() + 6) % 7));
  const m = new Map<LocalDate, JourMontre[]>();
  for (const j of jours) if (j.reparateurPct !== null) m.set(lundi(j.jour), [...(m.get(lundi(j.jour)) ?? []), j]);
  return [...m.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([l, js]) => {
      const pct = moyenne(js.map((x) => x.reparateurPct!));
      return { lundi: l, nuits: js.length, pct, minutes: moyenne(js.map((x) => x.reparateurMinutes!)), verdict: verdictReparateur(pct) };
    });
}

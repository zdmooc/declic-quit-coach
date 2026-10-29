/**
 * Statistiques (RM-26) : projections pures du journal rejoué, sur les journées notées.
 * Les journées sans aucune saisie ne sont pas des « zéros » : elles sont ignorées.
 */

import { libelleContexte } from './analyse';
import { historiqueJournees, journeeCourante, type EtatJournal, type JourneeHistorique } from './dashboard';
import { moyenne, nuits } from './sessions';
import { addDays, daysBetween, minutesOfDay, type Instant, type LocalDate } from './time';

export type TendanceConso = 'baisse' | 'stable' | 'hausse' | 'inconnue';

export interface PointJour {
  jour: LocalDate;
  valeur: number | null;
}

export interface Statistiques {
  jours: number;
  /** 1. Cigarettes par jour (14 derniers jours notés) et tendance. */
  parJour: PointJour[];
  tendance: TendanceConso;
  parSemaine: { lundi: LocalDate; moyenne: number; jours: number }[];
  /** 2. Cigarettes par heure (moyenne par journée notée, 14 jours). */
  parHeure: number[];
  /** 3. Moyenne par jour : semaine contre week-end (journées terminées). */
  semaine: number | null;
  weekend: number | null;
  /** 4. Première et dernière cigarette (minutes depuis minuit). */
  premiere: PointJour[];
  derniere: PointJour[];
  /** 5, 6, 8. Moyenne du jour (hors nuit), nuit, plus longue pause d'éveil. */
  moyenneDuJour: PointJour[];
  nuit: PointJour[];
  plusLonguePause: PointJour[];
  /** 9. Contextes sur 14 jours, avec la part de la 1re et de la 2e semaine. */
  contextes: { libelle: string; nombre: number; part: number; avant: number; apres: number }[];
  /** 10. Envies résistées / total par jour. */
  envies: { jour: LocalDate; resistees: number; total: number }[];
  /** 12. Effet des parades : cigarettes par jour dans le contexte, avant et depuis la parade. */
  parades: { libelle: string; parade: string; depuis: LocalDate; avant: number | null; apres: number | null }[];
  /** 15. Cigarettes par jour dans les 7 jours avant chaque bilan. */
  /** Maximum par jour (RM-30) : journées terminées du plan, 7 dernières, tenues ou non. */
  maximum: { tenus: number; jours: number } | null;
  bilans: { date: LocalDate; ldl?: number; hdl?: number; crp?: number; leucocytes?: number; cigarettesParJour: number | null }[];
}

const somme = (xs: readonly number[]) => xs.reduce((s, x) => s + x, 0);
const moy = (xs: readonly number[]) => (xs.length === 0 ? null : somme(xs) / xs.length);

function tendance(valeurs: readonly number[]): TendanceConso {
  if (valeurs.length < 4) return 'inconnue';
  const n = Math.min(3, Math.floor(valeurs.length / 2));
  const recents = moy(valeurs.slice(-n))!;
  const avant = moy(valeurs.slice(-2 * n, -n))!;
  if (avant === 0) return recents > 0 ? 'hausse' : 'stable';
  const ecart = (recents - avant) / avant;
  return ecart <= -0.1 ? 'baisse' : ecart >= 0.1 ? 'hausse' : 'stable';
}

const lundiDe = (j: LocalDate) => addDays(j, -((new Date(`${j}T12:00:00Z`).getUTCDay() + 6) % 7));

export function statistiques(etat: EtatJournal, maintenant: Instant, tz: string): Statistiques {
  const aujourdhui = journeeCourante(etat, maintenant, tz);
  const toutes = historiqueJournees(etat, maintenant, tz, 60).filter((j) => j.total > 0).reverse(); // ancien → récent
  const recentes = toutes.filter((j) => daysBetween(j.jour, aujourdhui) < 14);
  const terminees = toutes.filter((j) => j.jour !== aujourdhui);
  const ecarts = (j: JourneeHistorique) => j.cigarettes.map((c) => c.ecartMinutes).filter((x): x is number => x !== null);
  const parHeure = Array.from({ length: 24 }, () => 0);
  for (const j of recentes) for (const c of j.cigarettes) parHeure[Math.floor(minutesOfDay(c.a, tz) / 60)]!++;
  const finWeekend = (j: LocalDate) => [0, 6].includes(new Date(`${j}T12:00:00Z`).getUTCDay());

  // Semaines (lundi) : moyenne par journée notée, 6 dernières semaines.
  const semaines = new Map<LocalDate, number[]>();
  for (const j of toutes) semaines.set(lundiDe(j.jour), [...(semaines.get(lundiDe(j.jour)) ?? []), j.total]);

  // Contextes : 14 jours, découpés en deux moitiés pour voir l'évolution.
  const debut14 = addDays(aujourdhui, -13);
  const milieu = addDays(aujourdhui, -6);
  const parContexte = new Map<string, { nombre: number; avant: number; apres: number }>();
  let avecContexte = 0;
  for (const c of etat.cigarettes) {
    if (!c.contexte || daysBetween(debut14, c.jour) < 0) continue;
    avecContexte++;
    const l = libelleContexte(c.contexte, etat.contextesPerso);
    const v = parContexte.get(l) ?? { nombre: 0, avant: 0, apres: 0 };
    v.nombre++;
    if (daysBetween(milieu, c.jour) >= 0) v.apres++;
    else v.avant++;
    parContexte.set(l, v);
  }

  const joursNotes = new Set(etat.cigarettes.map((c) => c.jour));
  const parades = (Object.entries(etat.paradesDepuis) as [Parameters<typeof libelleContexte>[0], LocalDate][]).map(([cle, depuis]) => {
    const parJourDans = (filtre: (j: LocalDate) => boolean) => {
      const jours = [...joursNotes].filter((j) => filtre(j) && j !== aujourdhui);
      return jours.length === 0 ? null : etat.cigarettes.filter((c) => c.contexte === cle && jours.includes(c.jour)).length / jours.length;
    };
    return {
      libelle: libelleContexte(cle, etat.contextesPerso),
      parade: etat.parades[cle] ?? '',
      depuis,
      avant: parJourDans((j) => daysBetween(j, depuis) > 0),
      apres: parJourDans((j) => daysBetween(depuis, j) >= 0),
    };
  });

  const bilans = [...etat.bilans]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((b) => {
      const avant = toutes.filter((j) => daysBetween(j.jour, b.date) >= 1 && daysBetween(j.jour, b.date) <= 7);
      return {
        date: b.date,
        ...(b.valeurs.ldl !== undefined ? { ldl: b.valeurs.ldl } : {}),
        ...(b.valeurs.hdl !== undefined ? { hdl: b.valeurs.hdl } : {}),
        ...(b.valeurs.crp !== undefined ? { crp: b.valeurs.crp } : {}),
        ...(b.valeurs.leucocytes !== undefined ? { leucocytes: b.valeurs.leucocytes } : {}),
        cigarettesParJour: moy(avant.map((j) => j.total)),
      };
    });

  const nuitsParJour = new Map(nuits(etat.cigarettes).map((n) => [n.jour, n.minutes]));
  const serie = (f: (j: JourneeHistorique) => number | null) => recentes.map((j) => ({ jour: j.jour, valeur: f(j) }));

  return {
    jours: toutes.length,
    parJour: serie((j) => j.total),
    tendance: tendance(terminees.map((j) => j.total)),
    parSemaine: [...semaines.entries()].slice(-6).map(([lundi, xs]) => ({ lundi, moyenne: moy(xs)!, jours: xs.length })),
    parHeure: parHeure.map((n) => (recentes.length === 0 ? 0 : n / recentes.length)),
    semaine: moy(terminees.filter((j) => !finWeekend(j.jour)).map((j) => j.total)),
    weekend: moy(terminees.filter((j) => finWeekend(j.jour)).map((j) => j.total)),
    premiere: serie((j) => (j.cigarettes[0] ? minutesOfDay(j.cigarettes[0].a, tz) : null)),
    derniere: serie((j) => (j.jour === aujourdhui || !j.cigarettes.at(-1) ? null : minutesOfDay(j.cigarettes.at(-1)!.a, tz))),
    moyenneDuJour: serie((j) => {
      const m = moyenne(ecarts(j));
      return m === null ? null : Math.round(m);
    }),
    nuit: serie((j) => nuitsParJour.get(j.jour) ?? null),
    plusLonguePause: serie((j) => (ecarts(j).length === 0 ? null : Math.max(...ecarts(j)))),
    contextes: [...parContexte.entries()]
      .map(([libelle, v]) => ({ libelle, ...v, part: v.nombre / avecContexte }))
      .sort((a, b) => b.nombre - a.nombre),
    envies: recentes.map((j) => ({ jour: j.jour, resistees: j.envies, total: j.envies + j.enviesSignalees })),
    parades,
    maximum: (() => {
      const plan = terminees.filter((j) => j.quota !== null).slice(-7);
      return plan.length === 0 ? null : { tenus: plan.filter((j) => j.fumees <= j.quota!).length, jours: plan.length };
    })(),
    bilans,
  };
}

/**
 * Données de la montre et des capteurs (RM-27), lues dans Health Connect (Zepp, Dexcom, RENPHO…).
 * Elles ne sont PAS enregistrées dans le journal : lues à la demande, elles restent sur le téléphone
 * et ne partent jamais vers le coach IA. Projection pure : croisement avec les cigarettes.
 */

import type { EtatJournal } from './dashboard';
import { addDays, localDateOf, type Instant, type LocalDate } from './time';

export interface DonneesMontre {
  luLe: Instant;
  sommeils: { debut: Instant; fin: Instant }[];
  frequence: { a: Instant; bpm: number }[];
  repos: { a: Instant; bpm: number }[];
  hrv: { a: Instant; ms: number }[];
  pas: { debut: Instant; fin: Instant; n: number }[];
  spo2: { a: Instant; pct: number }[];
  glucose: { a: Instant; mgdl: number }[];
  tension: { a: Instant; sys: number; dia: number }[];
  poids: { a: Instant; kg: number }[];
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

export function analyserMontre(etat: EtatJournal, d: DonneesMontre, aujourdhui: LocalDate, tz: string, nbJours = 14): AnalyseMontre {
  const dates = Array.from({ length: nbJours }, (_, i) => addDays(aujourdhui, i - nbJours + 1));
  const duJour = <T extends { a: Instant }>(xs: readonly T[], j: LocalDate) => xs.filter((x) => localDateOf(x.a, tz) === j);
  const jours = dates.map((jour): JourMontre => {
    // Sommeil principal : la plus longue session qui se termine ce jour-là.
    const s = d.sommeils.filter((x) => localDateOf(x.fin, tz) === jour).sort((a, b) => b.fin - b.debut - (a.fin - a.debut))[0];
    const premiere = etat.cigarettes.filter((c) => c.jour === jour).sort((a, b) => a.a - b.a)[0];
    const glu = duJour(d.glucose, jour).map((x) => x.mgdl);
    const pas = d.pas.filter((p) => localDateOf(p.debut, tz) === jour).reduce((t, p) => t + p.n, 0);
    const repos = duJour(d.repos, jour).map((x) => x.bpm);
    return {
      jour,
      reveil: s?.fin ?? null,
      sommeilMinutes: s ? Math.round((s.fin - s.debut) / 60_000) : null,
      delaiPremiereMinutes: s && premiere && premiere.a >= s.fin ? Math.round((premiere.a - s.fin) / 60_000) : null,
      premiereAvantReveil: Boolean(s && premiere && premiere.a < s.fin),
      premiere: premiere?.a ?? null,
      frequenceRepos: repos.length ? Math.min(...repos) : null,
      hrvMs: moy(duJour(d.hrv, jour).map((x) => x.ms)),
      pas: pas > 0 ? pas : null,
      spo2: moy(duJour(d.spo2, jour).map((x) => x.pct)),
      glucose: glu.length ? { moyenne: moy(glu)!, min: Math.min(...glu), max: Math.max(...glu) } : null,
    };
  });

  // Effet d'une cigarette sur le cœur : seulement si des mesures existent avant ET après.
  const debut = Math.min(...dates.map((j) => Date.parse(`${j}T00:00:00Z`))) - 86_400_000;
  const avant: number[] = [];
  const apres: number[] = [];
  let n = 0;
  for (const c of etat.cigarettes.filter((x) => x.a >= debut)) {
    const av = d.frequence.filter((f) => f.a >= c.a - DEMI_HEURE && f.a < c.a).map((f) => f.bpm);
    const ap = d.frequence.filter((f) => f.a >= c.a && f.a < c.a + DEMI_HEURE).map((f) => f.bpm);
    if (av.length && ap.length) {
      avant.push(moy(av)!);
      apres.push(moy(ap)!);
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

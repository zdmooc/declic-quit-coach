/**
 * Journée de fumeur (RM-14) : on ne demande pas les heures de lever et de coucher.
 * Une journée commence à la première cigarette qui suit une pause d'au moins
 * SEUIL_NUIT_MINUTES (la nuit) et prend la date locale de cette cigarette.
 * Deux morceaux séparés par une longue pause le même jour civil gardent la même date.
 */

import { localDateOf, minutesBetween, type Instant, type LocalDate } from './time';

/** 5 h : toute nuit de sommeil (6 à 8 h) produit une pause plus longue. */
export const SEUIL_NUIT_MINUTES = 5 * 60;

/** Étiquette chaque cigarette (instants triés) avec sa journée. */
export function etiqueterCigarettes(
  instantsTries: readonly Instant[],
  tz: string,
  seuilMinutes = SEUIL_NUIT_MINUTES,
  /** Journées déclarées par une source importée (même index) : elles priment sur la règle. */
  declarees: readonly (LocalDate | undefined)[] = [],
): LocalDate[] {
  const out: LocalDate[] = [];
  for (let i = 0; i < instantsTries.length; i++) {
    const t = instantsTries[i]!;
    const prev = i > 0 ? instantsTries[i - 1]! : null;
    out.push(declarees[i] ?? (prev !== null && minutesBetween(prev, t) < seuilMinutes ? out[i - 1]! : localDateOf(t, tz)));
  }
  return out;
}

export interface CigaretteEtiquetee {
  a: Instant;
  jour: LocalDate;
}

/**
 * Journée d'un instant quelconque (envie, substitut, maintenant) : celle de la dernière
 * cigarette si elle date de moins que le seuil, sinon la date locale de l'instant.
 */
export function journeeDe(
  instant: Instant,
  cigarettes: readonly CigaretteEtiquetee[],
  tz: string,
  seuilMinutes = SEUIL_NUIT_MINUTES,
): LocalDate {
  let derniere: CigaretteEtiquetee | null = null;
  for (const c of cigarettes) {
    if (c.a <= instant && (derniere === null || c.a > derniere.a)) derniere = c;
  }
  if (derniere && minutesBetween(derniere.a, instant) < seuilMinutes) return derniere.jour;
  return localDateOf(instant, tz);
}

/**
 * Intervalles « éveillés » entre cigarettes consécutives d'une même journée
 * (les pauses de nuit, au-delà du seuil, sont exclues).
 */
export function intervallesEveilles(
  cigarettes: readonly CigaretteEtiquetee[],
  seuilMinutes = SEUIL_NUIT_MINUTES,
): number[] {
  const tries = [...cigarettes].sort((x, y) => x.a - y.a);
  const out: number[] = [];
  for (let i = 1; i < tries.length; i++) {
    const ecart = minutesBetween(tries[i - 1]!.a, tries[i]!.a);
    if (tries[i]!.jour === tries[i - 1]!.jour && ecart < seuilMinutes) out.push(ecart);
  }
  return out;
}

export const moyenne = (valeurs: readonly number[]): number | null =>
  valeurs.length === 0 ? null : valeurs.reduce((s, v) => s + v, 0) / valeurs.length;

export function mediane(valeurs: readonly number[]): number | null {
  if (valeurs.length === 0) return null;
  const t = [...valeurs].sort((a, b) => a - b);
  const m = Math.floor(t.length / 2);
  return t.length % 2 === 1 ? t[m]! : (t[m - 1]! + t[m]!) / 2;
}

/**
 * Moyenne du jour « en direct » : les écarts déjà faits plus la pause en cours, comme si la
 * prochaine cigarette était fumée maintenant. La pause en cours ne compte pas au-delà du seuil de nuit.
 */
export function moyenneEnDirect(
  intervalles: readonly number[],
  derniere: number | null,
  maintenant: number,
  seuilMinutes = SEUIL_NUIT_MINUTES,
): number | null {
  if (derniere === null) return moyenne(intervalles);
  const pause = Math.max(0, (maintenant - derniere) / 60_000);
  return pause >= seuilMinutes ? moyenne(intervalles) : moyenne([...intervalles, pause]);
}

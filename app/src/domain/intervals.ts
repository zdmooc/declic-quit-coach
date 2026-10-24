/**
 * Intervalles entre cigarettes (RM-02, RM-03).
 */

import { addMinutes, minutesBetween, type Instant } from './time';

/**
 * Intervalle cible (RM-02) : la durée active habituelle (première → dernière cigarette)
 * répartie entre les cigarettes du quota, soit durée ÷ (quota − 1). `null` sous 2 cigarettes.
 */
export function intervalleCibleMinutes(dureeActiveMinutes: number, quota: number): number | null {
  if (quota < 2 || dureeActiveMinutes <= 0) return null;
  return dureeActiveMinutes / (quota - 1);
}

export type StatutProchaine =
  | { statut: 'arret' }
  | { statut: 'quota-atteint' }
  | { statut: 'disponible'; depuis: Instant | null }
  | { statut: 'attendre'; a: Instant; resteMinutes: number };

/**
 * Prochaine cigarette conseillée (RM-03). La première de la journée n'a pas d'heure imposée :
 * c'est elle qui ouvre la journée. Ensuite : dernière cigarette + intervalle cible.
 */
export function prochaineCigarette(params: {
  maintenant: Instant;
  quota: number;
  fumeesAujourdhui: readonly Instant[];
  intervalleMinutes: number | null;
}): StatutProchaine {
  const { maintenant, quota, fumeesAujourdhui, intervalleMinutes } = params;
  if (quota <= 0) return { statut: 'arret' };
  if (fumeesAujourdhui.length >= quota) return { statut: 'quota-atteint' };
  if (fumeesAujourdhui.length === 0 || intervalleMinutes === null) return { statut: 'disponible', depuis: null };
  const a = addMinutes(Math.max(...fumeesAujourdhui), intervalleMinutes);
  if (a <= maintenant) return { statut: 'disponible', depuis: a };
  return { statut: 'attendre', a, resteMinutes: Math.ceil(minutesBetween(maintenant, a)) };
}

/** Intervalle moyen réel entre cigarettes consécutives ; `null` s'il y en a moins de deux. */
export function intervalleMoyenMinutes(instants: readonly Instant[]): number | null {
  if (instants.length < 2) return null;
  const tries = [...instants].sort((a, b) => a - b);
  return minutesBetween(tries[0]!, tries[tries.length - 1]!) / (tries.length - 1);
}

/**
 * Plus longue période sans fumer (en minutes), y compris la période en cours
 * depuis la dernière cigarette. `depuisDebut` sert de point de départ s'il n'y a aucune cigarette.
 */
export function plusLonguePauseMinutes(instants: readonly Instant[], maintenant: Instant, depuisDebut: Instant): number {
  const tries = [...instants].filter((t) => t <= maintenant).sort((a, b) => a - b);
  // La pause entre le début du suivi et la première cigarette compte aussi.
  let precedent = Math.min(depuisDebut, maintenant);
  let max = 0;
  for (const t of tries) {
    max = Math.max(max, minutesBetween(precedent, t));
    precedent = Math.max(precedent, t);
  }
  max = Math.max(max, minutesBetween(precedent, maintenant));
  return Math.max(0, max);
}

/** Tolérance : une cigarette fumée jusqu'à 1 min avant la fin de l'intervalle compte comme respectée. */
export const TOLERANCE_INTERVALLE_MINUTES = 1;

export interface RespectIntervalle {
  intervalleMinutes: number | null;
  respectees: number;
  nonRespectees: number;
}

/**
 * RM-18 : chaque cigarette de la journée, sauf la première, est comparée à la précédente.
 * Écart ≥ intervalle (à 1 min près) : respectée ; sinon : non respectée.
 */
export function respectIntervalle(instants: readonly Instant[], intervalleMinutes: number | null): RespectIntervalle {
  if (intervalleMinutes === null || intervalleMinutes <= 0) return { intervalleMinutes, respectees: 0, nonRespectees: 0 };
  const tries = [...instants].sort((a, b) => a - b);
  let respectees = 0;
  let nonRespectees = 0;
  for (let i = 1; i < tries.length; i++) {
    if (minutesBetween(tries[i - 1]!, tries[i]!) >= intervalleMinutes - TOLERANCE_INTERVALLE_MINUTES) respectees++;
    else nonRespectees++;
  }
  return { intervalleMinutes, respectees, nonRespectees };
}

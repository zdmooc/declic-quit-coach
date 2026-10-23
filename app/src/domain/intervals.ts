/**
 * Intervalles entre cigarettes (RM-02, RM-03).
 */

import { addMinutes, minutesBetween, type Fenetre, type Instant } from './time';

export const dureeEveilMinutes = (f: Fenetre): number => Math.max(0, minutesBetween(f.start, f.end));

/** Intervalle cible du jour : temps éveillé ÷ quota. `null` si le quota est nul. */
export function intervalleCibleMinutes(fenetre: Fenetre, quota: number): number | null {
  if (quota <= 0) return null;
  return dureeEveilMinutes(fenetre) / quota;
}

export type StatutProchaine =
  | { statut: 'arret' }
  | { statut: 'quota-atteint' }
  | { statut: 'disponible'; depuis: Instant }
  | { statut: 'attendre'; a: Instant; resteMinutes: number };

/**
 * Prochaine cigarette conseillée (RM-03) : dernière cigarette du jour + intervalle cible,
 * jamais avant l'heure de lever.
 */
export function prochaineCigarette(params: {
  maintenant: Instant;
  fenetre: Fenetre;
  quota: number;
  fumeesAujourdhui: readonly Instant[];
  /** Intervalle imposé (premier jour partiel, RM-13) ; par défaut temps éveillé ÷ quota. */
  intervalleMinutes?: number;
}): StatutProchaine {
  const { maintenant, fenetre, quota, fumeesAujourdhui } = params;
  if (quota <= 0) return { statut: 'arret' };
  if (fumeesAujourdhui.length >= quota) return { statut: 'quota-atteint' };
  const intervalle = params.intervalleMinutes ?? intervalleCibleMinutes(fenetre, quota) ?? 0;
  const derniere = fumeesAujourdhui.length > 0 ? Math.max(...fumeesAujourdhui) : null;
  const a = Math.max(derniere === null ? fenetre.start : addMinutes(derniere, intervalle), fenetre.start);
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
  let precedent = tries.length > 0 ? tries[0]! : depuisDebut;
  let max = tries.length > 0 ? 0 : minutesBetween(depuisDebut, maintenant);
  for (const t of tries.slice(1)) {
    max = Math.max(max, minutesBetween(precedent, t));
    precedent = t;
  }
  if (tries.length > 0) max = Math.max(max, minutesBetween(precedent, maintenant));
  return Math.max(0, max);
}

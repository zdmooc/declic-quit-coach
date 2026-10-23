/**
 * Économies (RM-06, RM-07). Tous les montants sont en centimes entiers.
 */

import { daysBetween, minutesBetween, type Fenetre, type Instant, type LocalDate } from './time';

export interface Prix {
  aPartirDu: LocalDate;
  prixPaquetCents: number;
  cigarettesParPaquet: number;
}

/** Prix en vigueur un jour donné (RM-06) : le dernier prix dont la date d'effet est passée. */
export function prixDuJour(historique: readonly Prix[], jour: LocalDate): Prix {
  if (historique.length === 0) throw new Error('Aucun prix défini');
  const tries = [...historique].sort((a, b) => daysBetween(b.aPartirDu, a.aPartirDu));
  let courant = tries[0]!;
  for (const p of tries) {
    if (daysBetween(p.aPartirDu, jour) < 0) break;
    courant = p;
  }
  return courant;
}

/** Valeur de `nombre` cigarettes au prix donné, arrondie au centime. */
export const valeurCents = (nombre: number, prix: Prix): number =>
  Math.round((nombre * prix.prixPaquetCents) / prix.cigarettesParPaquet);

/** RM-07 : économie d'une journée terminée, jamais négative. */
export function economieJourneeCents(initial: number, fumees: number, prix: Prix): number {
  return valeurCents(Math.max(0, initial - fumees), prix);
}

/**
 * Économie de la journée en cours, au prorata du temps éveillé écoulé :
 * on ne compte comme évitées que les cigarettes qui « auraient déjà été fumées ».
 */
export function economieEnCoursCents(params: {
  initial: number;
  fumees: number;
  prix: Prix;
  fenetre: Fenetre;
  maintenant: Instant;
}): number {
  const { initial, fumees, prix, fenetre, maintenant } = params;
  const total = minutesBetween(fenetre.start, fenetre.end);
  const ecoule = Math.min(Math.max(minutesBetween(fenetre.start, maintenant), 0), total);
  const fraction = total > 0 ? ecoule / total : 1;
  return valeurCents(Math.max(0, initial * fraction - fumees), prix);
}

export interface Projection {
  parJourCents: number;
  parMoisCents: number;
  parAnCents: number;
}

/** Économies projetées une fois l'arrêt complet atteint. */
export function projectionArret(initial: number, prix: Prix): Projection {
  return {
    parJourCents: valeurCents(initial, prix),
    parMoisCents: valeurCents(initial * 30, prix),
    parAnCents: valeurCents(initial * 365, prix),
  };
}

/** Nombre de jours avant d'atteindre un objectif d'épargne au rythme donné. */
export function joursAvantObjectif(objectifCents: number, cumulCents: number, rythmeParJourCents: number): number | null {
  if (cumulCents >= objectifCents) return 0;
  if (rythmeParJourCents <= 0) return null;
  return Math.ceil((objectifCents - cumulCents) / rythmeParJourCents);
}

/** Formatage pour l'affichage : 1234 → « 12,34 € ». */
export function formatEuros(cents: number): string {
  const signe = cents < 0 ? '-' : '';
  const abs = Math.abs(Math.round(cents));
  const euros = Math.floor(abs / 100);
  const centimes = String(abs % 100).padStart(2, '0');
  const milliers = String(euros).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${signe}${milliers},${centimes} €`;
}

/**
 * Jalons de motivation : bénéfices santé (contenus de `config/health-milestones.json`)
 * et paliers d'économies.
 */

import { addMinutes, type Instant } from './time';

export interface JalonSante {
  id: string;
  /** Délai depuis la dernière cigarette, en heures. */
  heures: number;
  message: string;
}

export interface ContenuSante {
  version: string;
  validePar: string | null;
  jalons: JalonSante[];
}

/** Jalons santé atteints depuis la dernière cigarette. */
export function jalonsAtteints(contenu: ContenuSante, derniereCigarette: Instant, maintenant: Instant): JalonSante[] {
  return contenu.jalons.filter((j) => addMinutes(derniereCigarette, j.heures * 60) <= maintenant);
}

/** Prochains jalons santé, avec leur instant. */
export function prochainsJalons(
  contenu: ContenuSante,
  derniereCigarette: Instant,
  maintenant: Instant,
): (JalonSante & { a: Instant })[] {
  return contenu.jalons
    .map((j) => ({ ...j, a: addMinutes(derniereCigarette, j.heures * 60) }))
    .filter((j) => j.a > maintenant)
    .sort((a, b) => a.a - b.a);
}

/** Paliers d'économies célébrés, en centimes. */
export const PALIERS_ECONOMIES_CENTS = [1_000, 2_000, 5_000, 10_000, 20_000, 50_000, 100_000, 200_000, 500_000, 1_000_000];

/** Paliers franchis entre deux cumuls (pour une notification de célébration). */
export function paliersFranchis(avantCents: number, apresCents: number): number[] {
  return PALIERS_ECONOMIES_CENTS.filter((p) => avantCents < p && apresCents >= p);
}

/**
 * Substituts nicotiniques (RM-08, RM-09, ADR-0004).
 *
 * Le domaine SUIT l'usage déclaré et applique les limites de la table de référence.
 * Il ne calcule ni ne propose jamais de dose.
 */

import { addMinutes, minutesBetween, type Instant } from './time';

export interface ProduitOral {
  forme: 'pastille' | 'gomme';
  /** Maximum de prises par jour selon la notice ; `null` tant que non renseigné. */
  maxParJour: number | null;
}

export interface ReferencePharma {
  version: string;
  /** Nom du professionnel ayant validé la table ; `null` = brouillon. */
  validePar: string | null;
  valideLe: string | null;
  oraux: ProduitOral[];
}

/** Une table non validée ne doit pas être utilisée pour des alertes ou des courbes. */
export const estValidee = (ref: ReferencePharma): boolean => ref.validePar !== null && ref.valideLe !== null;

export interface PatchEnCours {
  poseLe: Instant;
  dosageMg: number;
  dureePortHeures: 16 | 24;
}

export type EtatPatch =
  | { statut: 'aucun' }
  | { statut: 'porte'; poseLe: Instant; retraitPrevu: Instant; resteMinutes: number; dosageMg: number }
  | { statut: 'a-retirer'; poseLe: Instant; retraitPrevu: Instant; retardMinutes: number; dosageMg: number };

export function etatPatch(patch: PatchEnCours | null, maintenant: Instant): EtatPatch {
  if (!patch) return { statut: 'aucun' };
  const retraitPrevu = addMinutes(patch.poseLe, patch.dureePortHeures * 60);
  const reste = minutesBetween(maintenant, retraitPrevu);
  if (reste > 0) return { statut: 'porte', poseLe: patch.poseLe, retraitPrevu, resteMinutes: Math.ceil(reste), dosageMg: patch.dosageMg };
  return { statut: 'a-retirer', poseLe: patch.poseLe, retraitPrevu, retardMinutes: Math.floor(-reste), dosageMg: patch.dosageMg };
}

export interface EtatOral {
  forme: 'pastille' | 'gomme';
  prisesAujourdhui: number;
  /** `null` si la table n'est pas validée ou si le maximum n'est pas renseigné. */
  maxParJour: number | null;
  maxAtteint: boolean;
}

/** RM-09 : compte les prises du jour et signale l'atteinte du maximum de la notice. */
export function etatOral(forme: 'pastille' | 'gomme', prisesAujourdhui: number, ref: ReferencePharma): EtatOral {
  const produit = estValidee(ref) ? ref.oraux.find((p) => p.forme === forme) : undefined;
  const max = produit?.maxParJour ?? null;
  return { forme, prisesAujourdhui, maxParJour: max, maxAtteint: max !== null && prisesAujourdhui >= max };
}

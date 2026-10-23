/**
 * Plan de réduction (RM-01, RM-04) et stratégies de rythme (pattern Strategy).
 */

import { addDays, daysBetween, type LocalDate } from './time';

/** Retire `pas` cigarettes tous les `periodeJours` jours (hors jours de palier). */
export interface ReductionStrategy {
  kind: 'pas';
  pas: number;
  periodeJours: number;
}

export const MOINS_UN_PAR_JOUR: ReductionStrategy = { kind: 'pas', pas: 1, periodeJours: 1 };
export const MOINS_UN_TOUS_LES_2_JOURS: ReductionStrategy = { kind: 'pas', pas: 1, periodeJours: 2 };
export const MOINS_UN_PAR_SEMAINE: ReductionStrategy = { kind: 'pas', pas: 1, periodeJours: 7 };

export interface PlanInput {
  initial: number;
  dateDebut: LocalDate;
  /** Changements de rythme ; le premier s'applique à `dateDebut`. */
  rythmes: readonly { aPartirDu: LocalDate; strategie: ReductionStrategy }[];
  /** Jours où le quota reste celui de la veille. */
  paliers: readonly LocalDate[];
}

function strategieActive(plan: PlanInput, jour: LocalDate): { depuis: LocalDate; strategie: ReductionStrategy } {
  const tries = [...plan.rythmes].sort((a, b) => daysBetween(b.aPartirDu, a.aPartirDu));
  let active = { depuis: plan.dateDebut, strategie: tries[0]?.strategie ?? MOINS_UN_PAR_JOUR };
  for (const r of tries) {
    if (daysBetween(r.aPartirDu, jour) < 0) break;
    const depuis = daysBetween(plan.dateDebut, r.aPartirDu) > 0 ? r.aPartirDu : plan.dateDebut;
    active = { depuis, strategie: r.strategie };
  }
  return active;
}

/** Stratégie en vigueur un jour donné (y compris un changement programmé pour ce jour). */
export function strategieCourante(plan: PlanInput, jour: LocalDate): ReductionStrategy {
  return strategieActive(plan, jour).strategie;
}

/**
 * Quota de chaque jour, du premier jour du plan jusqu'à `jusquAu` inclus.
 * Le quota ne remonte jamais ; un jour de palier garde le quota de la veille.
 */
export function quotas(plan: PlanInput, jusquAu: LocalDate): Map<LocalDate, number> {
  const out = new Map<LocalDate, number>();
  const total = daysBetween(plan.dateDebut, jusquAu);
  if (total < 0) return out;
  const paliers = new Set(plan.paliers);
  let quota = plan.initial;
  let compteur = 0;
  let depuisCourant = plan.dateDebut;
  out.set(plan.dateDebut, quota);
  for (let i = 1; i <= total; i++) {
    const jour = addDays(plan.dateDebut, i);
    const { depuis, strategie } = strategieActive(plan, jour);
    if (depuis !== depuisCourant) {
      // Le jour du changement est le « jour 0 » du nouveau rythme : quota inchangé.
      depuisCourant = depuis;
      compteur = 0;
      out.set(jour, quota);
      continue;
    }
    if (!paliers.has(jour) && quota > 0) {
      compteur++;
      if (compteur % strategie.periodeJours === 0) quota = Math.max(0, quota - strategie.pas);
    }
    out.set(jour, quota);
  }
  return out;
}

/** Quota d'un jour (RM-01). Avant le début du plan : consommation initiale. */
export function quotaDuJour(plan: PlanInput, jour: LocalDate): number {
  if (daysBetween(plan.dateDebut, jour) < 0) return plan.initial;
  return quotas(plan, jour).get(jour) ?? plan.initial;
}

/** Date prévue du zéro, si aucun nouveau palier n'est ajouté. */
export function dateDuZero(plan: PlanInput, maxJours = 3650): LocalDate | null {
  const horizon = addDays(plan.dateDebut, maxJours);
  for (const [jour, q] of quotas(plan, horizon)) if (q === 0) return jour;
  return null;
}

/**
 * RM-04 : si la veille a dépassé son quota, on propose un palier pour aujourd'hui
 * plutôt que de baisser encore.
 */
export function proposerPalier(fumeesVeille: number, quotaVeille: number): boolean {
  return fumeesVeille > quotaVeille;
}

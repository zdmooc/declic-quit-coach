/**
 * Journées et plan : observation (RM-15), proposition de plan, quotas effectifs, fenêtres et
 * éléments d'une journée. Fonctions pures sur l'état rejoué.
 */

import { DUREE_ACTIVE_PAR_DEFAUT, mesurerHabitudes, type Habitudes } from './habitudes';
import { quotaDuJour, quotas } from './reduction';
import { economieJourneeCents, prixDuJour, valeurCents } from './savings';
import { journeeDe, SEUIL_NUIT_MINUTES } from './sessions';
import { addDays, awakeWindow, daysBetween, localDateOf, minutesBetween, zonedInstant, type Fenetre, type Horaires, type Instant, type LocalDate, type TimeOfDay } from './time';
import { type CigaretteJournal, type EtatJournal, HORAIRES_PAR_DEFAUT } from './etat';
import { type JourneeHistorique } from './historique';

/* ------------------------------------------------------------------ */
/* Observation (RM-15)                                                  */
/* ------------------------------------------------------------------ */

/** Première journée mesurable de l'observation. */
function debutObservation(etat: EtatJournal, tz: string): LocalDate {
  const jourCreation = localDateOf(etat.profilCreeLe, tz);
  return etat.dejaFumeAujourdhui ? addDays(jourCreation, 1) : jourCreation;
}

export interface PropositionPlan {
  referenceParJour: number;
  quotaDepart: number;
  debutHabituel: TimeOfDay;
  finHabituelle: TimeOfDay;
  dateDebut: LocalDate;
  origine: 'observation' | 'declaration';
}

export interface EtatObservation {
  joursMesures: number;
  joursRequis: number;
  terminee: boolean;
  habitudes: Habitudes | null;
  proposition: PropositionPlan;
}

/** Journée en cours (ou à venir) à un instant donné. */
export const journeeCourante = (etat: EtatJournal, maintenant: Instant, tz: string): LocalDate =>
  journeeDe(maintenant, etat.cigarettes, tz);

/**
 * Proposition de plan : mesurée si l'observation est terminée, sinon à partir de la déclaration.
 * Après l'observation, le plan commence à la prochaine journée si la journée en cours est entamée.
 */
export function proposerPlan(etat: EtatJournal, maintenant: Instant, tz: string): EtatObservation {
  const jour = journeeCourante(etat, maintenant, tz);
  const habitudes = mesurerHabitudes(etat.cigarettes, jour, tz, { depuis: debutObservation(etat, tz), sansHeure: cigarettesSansHeureParJour(etat) });
  const joursMesures = habitudes?.joursMesures ?? 0;
  const terminee = joursMesures >= etat.joursObservation;
  const journeeEntamee = etat.cigarettes.some((c) => c.jour === jour);
  const reference = terminee && habitudes ? Math.max(1, Math.round(habitudes.cigarettesParJour)) : etat.declare;
  return {
    joursMesures,
    joursRequis: etat.joursObservation,
    terminee,
    habitudes,
    proposition: {
      referenceParJour: reference,
      quotaDepart: Math.max(0, reference - 1),
      debutHabituel: habitudes?.debutHabituel ?? HORAIRES_PAR_DEFAUT.wake,
      finHabituelle: habitudes?.finHabituelle ?? HORAIRES_PAR_DEFAUT.bed,
      dateDebut: terminee && journeeEntamee ? addDays(jour, 1) : jour,
      origine: terminee ? 'observation' : 'declaration',
    },
  };
}

/* ------------------------------------------------------------------ */
/* Plan en cours                                                        */
/* ------------------------------------------------------------------ */

/** Durée active habituelle (première → dernière cigarette), en minutes. */
export function dureeActive(h: Horaires): number {
  const f = awakeWindow('2026-01-15', h, 'UTC');
  return Math.max(0, minutesBetween(f.start, f.end)) || DUREE_ACTIVE_PAR_DEFAUT;
}

/**
 * RM-13 : plan démarré au milieu d'une journée déjà entamée. Seules les cigarettes fumées après
 * le démarrage comptent, et le quota du jour est réduit à la part restante de la durée active.
 */
export function premierJourPartiel(etat: EtatJournal): { debut: Instant; fraction: number } | null {
  const plan = etat.plan;
  if (!plan) return null;
  const avant = elementsDuJour(etat.cigarettes, plan.input.dateDebut).filter((c) => c.a < plan.demarreLe);
  if (avant.length === 0) return null;
  const premiere = debutEveil(avant.map((c) => c.a));
  const ecoule = minutesBetween(premiere, plan.demarreLe);
  return { debut: plan.demarreLe, fraction: Math.min(1, Math.max(0, 1 - ecoule / dureeActive(plan.horaires))) };
}

/**
 * Début de la période d'éveil en cours : première cigarette après la dernière pause de nuit.
 * Une cigarette d'après minuit rattachée à la journée (journal importé, 00 h 21) ne doit pas
 * faire croire que la journée a commencé à minuit.
 */
export function debutEveil(instants: readonly Instant[]): Instant {
  const tries = [...instants].sort((x, y) => x - y);
  let debut = tries[0]!;
  for (let i = 1; i < tries.length; i++) if (minutesBetween(tries[i - 1]!, tries[i]!) >= SEUIL_NUIT_MINUTES) debut = tries[i]!;
  return debut;
}

/**
 * Index « journée → éléments », construit une fois par journal rejoué : les écrans parcourent
 * des centaines de journées, et filtrer toutes les cigarettes à chaque fois coûtait cher.
 */
const INDEX_JOURS = new WeakMap<readonly { jour: LocalDate }[], { taille: number; parJour: Map<LocalDate, unknown[]> }>();

export function elementsDuJour<T extends { jour: LocalDate }>(liste: readonly T[], jour: LocalDate): readonly T[] {
  let idx = INDEX_JOURS.get(liste);
  if (!idx || idx.taille !== liste.length) {
    const parJour = new Map<LocalDate, unknown[]>();
    for (const x of liste) {
      const l = parJour.get(x.jour);
      if (l) l.push(x);
      else parJour.set(x.jour, [x]);
    }
    idx = { taille: liste.length, parJour };
    INDEX_JOURS.set(liste, idx);
  }
  return (idx.parJour.get(jour) as T[] | undefined) ?? [];
}

/** Cigarettes comptées pour une journée du plan (hors cigarettes d'avant le démarrage). */
export function fumeesDuJour(etat: EtatJournal, jour: LocalDate): CigaretteJournal[] {
  const plan = etat.plan;
  return elementsDuJour(etat.cigarettes, jour).filter((c) => !plan || jour !== plan.input.dateDebut || c.a >= plan.demarreLe);
}

/** Saisies sans heure d'une journée (historique importé), par nature. */
export function sansHeureDuJour(etat: EtatJournal, jour: LocalDate, nature: 'cigarettes' | 'envies-signalees'): number {
  return elementsDuJour(etat.sansHeure, jour)
    .filter((a) => a.nature === nature)
    .reduce((s, a) => s + a.nombre, 0);
}

/** Patchs portés pendant le jour civil donné. */
export function patchsDuJour(etat: EtatJournal, jour: LocalDate, tz: string): JourneeHistorique['patchs'] {
  const debut = zonedInstant(jour, '00:00', tz);
  const fin = zonedInstant(addDays(jour, 1), '00:00', tz);
  return etat.patchs
    .filter((p) => p.poseLe < fin && (p.retireLe === null || p.retireLe > debut))
    .map((p) => ({ dosageMg: p.dosageMg, poseA: p.poseLe, renouvellementPrevu: p.poseLe + p.dureePortHeures * 3_600_000, retireA: p.retireLe }));
}

/**
 * Patch porté à l'instant donné : posé avant, ni retiré ni arrivé au bout de sa durée de port.
 * (Un patch oublié au-delà de sa durée n'est plus compté comme porté.)
 */
export function patchPorteA(etat: EtatJournal, a: Instant): number | null {
  const p = etat.patchs.find((x) => x.poseLe <= a && a < Math.min(x.retireLe ?? Infinity, x.poseLe + x.dureePortHeures * 3_600_000));
  return p ? p.dosageMg : null;
}

/** Cigarettes sans heure par journée (pour les moyennes d'habitudes). */
export function cigarettesSansHeureParJour(etat: EtatJournal): Map<LocalDate, number> {
  const m = new Map<LocalDate, number>();
  for (const a of etat.sansHeure) if (a.nature === 'cigarettes') m.set(a.jour, (m.get(a.jour) ?? 0) + a.nombre);
  return m;
}

/** Quota affiché d'un jour : celui du plan, réduit au prorata le premier jour partiel. */
export function quotaEffectif(etat: EtatJournal, jour: LocalDate): number {
  if (!etat.plan) return etat.declare;
  const q = quotaDuJour(etat.plan.input, jour);
  const p = jour === etat.plan.input.dateDebut ? premierJourPartiel(etat) : null;
  return p ? Math.min(q, Math.max(1, Math.ceil(q * p.fraction))) : q;
}

export interface LigneHistorique {
  jour: LocalDate;
  quota: number;
  fumees: number;
  economieCents: number;
}

/** Historique des journées terminées du plan, jusqu'à la veille de `aujourdhui`. */
export function historiqueQuotidien(etat: EtatJournal, aujourdhui: LocalDate): LigneHistorique[] {
  const plan = etat.plan;
  if (!plan) return [];
  const hier = addDays(aujourdhui, -1);
  if (daysBetween(plan.input.dateDebut, hier) < 0) return [];
  const p0 = premierJourPartiel(etat);
  const out: LigneHistorique[] = [];
  for (const [jour, quotaPlan] of quotas(plan.input, hier)) {
    const fumees = fumeesDuJour(etat, jour).length + sansHeureDuJour(etat, jour, 'cigarettes');
    const prix = prixDuJour(etat.prix, jour);
    const partiel = jour === plan.input.dateDebut ? p0 : null;
    out.push({
      jour,
      quota: partiel ? quotaEffectif(etat, jour) : quotaPlan,
      fumees,
      economieCents: partiel
        ? valeurCents(Math.max(0, plan.reference * partiel.fraction - fumees), prix)
        : economieJourneeCents(plan.reference, fumees, prix),
    });
  }
  return out;
}

/**
 * Fenêtre de comptage d'une journée : de la première cigarette (ou de l'heure habituelle si
 * elle est plus tôt) sur la durée active habituelle. Sert au prorata des économies du jour.
 */
export function fenetreDuJour(jour: LocalDate, horaires: Horaires, premiere: Instant | null, tz: string): Fenetre {
  const habituelle = awakeWindow(jour, horaires, tz);
  const start = premiere === null ? habituelle.start : Math.min(premiere, habituelle.start);
  return { start, end: start + (habituelle.end - habituelle.start) };
}

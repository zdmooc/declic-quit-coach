/**
 * Habitudes mesurées (RM-15, RM-17) : consommation réelle, heure habituelle de la première
 * et de la dernière cigarette, durée active, intervalle moyen. Calculées sur des journées
 * TERMINÉES uniquement (la journée en cours est incomplète).
 */

import { mediane, moyenne, intervallesEveilles, SEUIL_NUIT_MINUTES, type CigaretteEtiquetee } from './sessions';
import { daysBetween, localDateOf, minutesOfDay, type LocalDate, type TimeOfDay } from './time';

export interface Habitudes {
  joursMesures: number;
  /** Moyenne de cigarettes par journée. */
  cigarettesParJour: number;
  /** Heure habituelle de la première cigarette, 'HH:MM'. */
  debutHabituel: TimeOfDay;
  /** Heure habituelle de la dernière cigarette, 'HH:MM' (peut être après minuit). */
  finHabituelle: TimeOfDay;
  /** Durée habituelle entre la première et la dernière cigarette, en minutes. */
  dureeActiveMinutes: number;
  /** Intervalle moyen entre deux cigarettes d'une même journée. */
  intervalleMoyenMinutes: number | null;
}

/** Durée active par défaut (16 h) tant que rien n'est mesuré. */
export const DUREE_ACTIVE_PAR_DEFAUT = 16 * 60;

const hhmm = (minutes: number): TimeOfDay => {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

/**
 * Mesure les habitudes sur les `nbJours` dernières journées terminées avant `journeeCourante`.
 * `null` s'il n'y a aucune journée terminée.
 */
export function mesurerHabitudes(
  cigarettes: readonly CigaretteEtiquetee[],
  journeeCourante: LocalDate,
  tz: string,
  options: { nbJours?: number; depuis?: LocalDate; jusquAu?: LocalDate } = {},
): Habitudes | null {
  const nbJours = options.nbJours ?? 7;
  const terminees = cigarettes.filter(
    (c) =>
      daysBetween(c.jour, journeeCourante) > 0 &&
      (options.depuis === undefined || daysBetween(options.depuis, c.jour) >= 0) &&
      (options.jusquAu === undefined || daysBetween(c.jour, options.jusquAu) >= 0),
  );
  const parJour = new Map<LocalDate, CigaretteEtiquetee[]>();
  for (const c of terminees) parJour.set(c.jour, [...(parJour.get(c.jour) ?? []), c]);
  const jours = [...parJour.keys()].sort().slice(-nbJours);
  if (jours.length === 0) return null;

  const comptes: number[] = [];
  const debuts: number[] = [];
  const fins: number[] = [];
  const durees: number[] = [];
  const retenues: CigaretteEtiquetee[] = [];
  for (const jour of jours) {
    const liste = [...parJour.get(jour)!].sort((x, y) => x.a - y.a);
    retenues.push(...liste);
    comptes.push(liste.length);
    const premiere = liste[0]!.a;
    const derniere = liste[liste.length - 1]!.a;
    // Minutes depuis minuit de la date de la journée (une dernière cigarette à 1 h du matin vaut 25 h).
    const decalage = (t: number) => minutesOfDay(t, tz) + 1440 * daysBetween(jour, localDateOf(t, tz));
    debuts.push(decalage(premiere));
    fins.push(decalage(derniere));
    durees.push((derniere - premiere) / 60_000);
  }

  const dureeActive = mediane(durees.filter((d) => d > 0)) ?? DUREE_ACTIVE_PAR_DEFAUT;
  return {
    joursMesures: jours.length,
    cigarettesParJour: Math.round((moyenne(comptes) ?? 0) * 10) / 10,
    debutHabituel: hhmm(mediane(debuts)!),
    finHabituelle: hhmm(mediane(fins)!),
    dureeActiveMinutes: dureeActive,
    intervalleMoyenMinutes: moyenne(intervallesEveilles(retenues, SEUIL_NUIT_MINUTES)),
  };
}

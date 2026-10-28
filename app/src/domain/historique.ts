/**
 * Projection « historique détaillé » (écran Historique) : une ligne par journée avec ses cigarettes.
 */

import { libelleContexte } from './analyse';
import { type ContexteCigarette, type PrecisionHeure } from './events';
import { intervalleCibleMinutes, respectIntervalle, TOLERANCE_INTERVALLE_MINUTES } from './intervals';
import { quotaDuJour } from './reduction';
import { nuits, SEUIL_NUIT_MINUTES, type Nuit } from './sessions';
import { daysBetween, localDateOf, minutesBetween, type Instant, type LocalDate } from './time';
import { type EtatJournal } from './etat';
import { dureeActive, elementsDuJour, fumeesDuJour, historiqueQuotidien, journeeCourante, patchPorteA, patchsDuJour, quotaEffectif, sansHeureDuJour } from './journees';

/* ------------------------------------------------------------------ */
/* Historique détaillé (écran Historique)                               */
/* ------------------------------------------------------------------ */

export interface CigaretteHistorique {
  id: string;
  a: Instant;
  contexte?: ContexteCigarette;
  libelleContexte?: string;
  /** Heure approximative (historique importé) ; absente = exacte. */
  precision?: PrecisionHeure;
  /** Fumée le jour du démarrage du plan, avant le démarrage : comptée dans le total, pas dans le quota. */
  avantPlan?: true;
  /** Respect de l'intervalle par rapport à la précédente (RM-18) ; `null` pour la première de la journée. */
  respectee: boolean | null;
  /** Écart avec la précédente (minutes) ; `null` pour la première et après la nuit. */
  ecartMinutes: number | null;
  /** Dosage du patch porté au moment de la cigarette ; absent = fumée sans patch. */
  patchMg?: number;
}

export interface JourneeHistorique {
  jour: LocalDate;
  enPlan: boolean;
  /** Cigarettes comptées (quota) : hors avant-démarrage du plan, sans-heure inclus. */
  fumees: number;
  /** Total réel de la journée (avant-démarrage et sans-heure inclus). */
  total: number;
  /** Cigarettes historiques sans heure connue. */
  sansHeure: number;
  /** Envies signalées (horodatées et sans heure), distinctes des envies résistées. */
  enviesSignalees: number;
  /** Nuit qui précède la journée (dernière cigarette de la veille → première du jour). */
  nuitAvant: Nuit | null;
  /** Patchs portés ce jour-là (avec ou sans patch), avec heure de pose et de renouvellement prévu. */
  patchs: { dosageMg: number; poseA: Instant; renouvellementPrevu: Instant; retireA: Instant | null }[];
  /** Cigarettes horodatées fumées avec un patch porté. */
  sousPatch: number;
  quota: number | null;
  intervalleMinutes: number | null;
  respectees: number;
  nonRespectees: number;
  /** Économie de la journée terminée (plan seulement) ; `null` pour la journée en cours ou en observation. */
  economieCents: number | null;
  envies: number;
  cigarettes: CigaretteHistorique[];
}

/** Journées, de la plus récente à la plus ancienne (au plus `nbJours`), avec leurs cigarettes. */
export function historiqueJournees(etat: EtatJournal, maintenant: Instant, tz: string, nbJours = 30): JourneeHistorique[] {
  const aujourdhui = journeeCourante(etat, maintenant, tz);
  const plan = etat.plan;
  const lignesPlan = new Map(historiqueQuotidien(etat, aujourdhui).map((l) => [l.jour, l]));
  const jours = new Set<LocalDate>([...etat.cigarettes, ...etat.sansHeure, ...etat.enviesSignalees, ...etat.envies].map((c) => c.jour));
  for (const p of etat.patchs) jours.add(localDateOf(p.poseLe, tz));
  jours.add(aujourdhui);
  for (const l of lignesPlan.keys()) jours.add(l);
  const tries = [...jours].filter((j) => daysBetween(j, aujourdhui) >= 0).sort().reverse().slice(0, nbJours);

  const nuitsParJour = new Map(nuits(etat.cigarettes).map((n) => [n.jour, n]));
  return tries.map((jour) => {
    const enPlan = plan !== null && daysBetween(plan.input.dateDebut, jour) >= 0;
    const comptees = [...(enPlan ? fumeesDuJour(etat, jour) : elementsDuJour(etat.cigarettes, jour))].sort((x, y) => x.a - y.a);
    // L'historique montre toutes les cigarettes du jour, y compris celles d'avant le démarrage du plan.
    const liste = [...elementsDuJour(etat.cigarettes, jour)].sort((x, y) => x.a - y.a);
    const ids = new Set(comptees.map((c) => c.id));
    const sansHeure = sansHeureDuJour(etat, jour, 'cigarettes');
    const intervalle =
      enPlan && plan
        ? intervalleCibleMinutes(dureeActive(plan.horaires), quotaDuJour(plan.input, jour))
        : etat.intervalleRecommande;
    const cigarettes: CigaretteHistorique[] = liste.map((c, i, _, patchMg = patchPorteA(etat, c.a)) => ({
      id: c.id,
      a: c.a,
      ...(c.contexte ? { contexte: c.contexte, libelleContexte: libelleContexte(c.contexte, etat.contextesPerso) } : {}),
      ...(c.precision ? { precision: c.precision } : {}),
      ...(ids.has(c.id) ? {} : { avantPlan: true }),
      ...(patchMg !== null ? { patchMg } : {}),
      ecartMinutes: i === 0 || minutesBetween(liste[i - 1]!.a, c.a) >= SEUIL_NUIT_MINUTES ? null : Math.round(minutesBetween(liste[i - 1]!.a, c.a)),
      respectee:
        i === 0 || intervalle === null
          ? null
          : minutesBetween(liste[i - 1]!.a, c.a) >= intervalle - TOLERANCE_INTERVALLE_MINUTES,
    }));
    const respect = respectIntervalle(
      comptees.map((c) => c.a),
      intervalle,
    );
    return {
      jour,
      enPlan,
      fumees: comptees.length + sansHeure,
      total: liste.length + sansHeure,
      sansHeure,
      enviesSignalees: elementsDuJour(etat.enviesSignalees, jour).length + sansHeureDuJour(etat, jour, 'envies-signalees'),
      patchs: patchsDuJour(etat, jour, tz),
      nuitAvant: nuitsParJour.get(jour) ?? null,
      sousPatch: cigarettes.filter((c) => c.patchMg !== undefined).length,
      quota: enPlan ? quotaEffectif(etat, jour) : null,
      intervalleMinutes: intervalle,
      respectees: respect.respectees,
      nonRespectees: respect.nonRespectees,
      economieCents: lignesPlan.get(jour)?.economieCents ?? null,
      envies: elementsDuJour(etat.envies, jour).length,
      cigarettes,
    };
  });
}

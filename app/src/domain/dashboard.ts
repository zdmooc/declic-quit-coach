/**
 * Projection « tableau de bord » de la journée en cours (CQRS léger, ADR-0003).
 */

import { analyser, type Analyse, type ContextePerso } from './analyse';
import { mesurerHabitudes } from './habitudes';
import { intervalleCibleMinutes, plusLonguePauseMinutes, prochaineCigarette, respectIntervalle, type RespectIntervalle, type StatutProchaine } from './intervals';
import { dateDuZero, quotaDuJour } from './reduction';
import { economieEnCoursCents, economieJourneeCents, joursAvantObjectif, prixDuJour, projectionArret, type Projection } from './savings';
import { intervallesEveilles, moyenne, nuits, SEUIL_NUIT_MINUTES, type Nuit } from './sessions';
import { bilanTechniques, type BilanTechnique } from './respiration';
import { ouJenSuis, type Parcours } from './parcours';
import { suiviCafeine, type SuiviCafeine } from './cafeine';
import { etatOral, etatPatch, type EtatOral, type EtatPatch, type ReferencePharma } from './substitutes';
import { daysBetween, minutesBetween, zonedInstant, type Fenetre, type Instant, type LocalDate } from './time';
import { type EtatJournal, HORAIRES_PAR_DEFAUT } from './etat';
import { type EtatObservation, cigarettesSansHeureParJour, debutEveil, dureeActive, elementsDuJour, fenetreDuJour, fumeesDuJour, historiqueQuotidien, journeeCourante, premierJourPartiel, proposerPlan, quotaEffectif, sansHeureDuJour } from './journees';

/* ------------------------------------------------------------------ */
/* Tableau de bord                                                      */
/* ------------------------------------------------------------------ */

export type Phase = 'observation' | 'avant-debut' | 'reduction' | 'arret' | 'maintien';

export interface TableauDeBord {
  jour: LocalDate;
  phase: Phase;
  /**
   * Total réel de la journée : toutes les cigarettes, y compris celles d'avant le démarrage
   * du plan et celles sans heure connue. `fumees` reste le compte utilisé pour le quota.
   */
  fumeesJournee: number;
  /** Envies signalées aujourd'hui (distinctes des envies résistées). */
  enviesSignalees: number;
  /** Jour du plan, 0 = premier jour ; `null` pendant l'observation. */
  jourDuPlan: number | null;
  observation: EtatObservation | null;
  quota: number | null;
  fumees: number;
  restant: number | null;
  prochaine: StatutProchaine | null;
  /**
   * Origine de l'intervalle du compte à rebours : le plan, ou pendant l'observation la
   * recommandation de 60 min — indicative, sans notification.
   */
  sourceIntervalle: 'plan' | 'habitude';
  /** RM-18 : cigarettes du jour qui ont respecté (ou non) l'intervalle recommandé. */
  respect: RespectIntervalle;
  intervalleCibleMinutes: number | null;
  /** Intervalle moyen entre deux cigarettes aujourd'hui (nuit exclue). */
  intervalleMoyenJourMinutes: number | null;
  /** Écarts du jour (nuit exclue), pour la moyenne en direct. */
  intervallesJourMinutes: number[];
  /** Dernière cigarette de la journée en cours. */
  derniereDuJourA: Instant | null;
  /** Intervalle moyen sur les 7 dernières journées terminées. */
  intervalleMoyen7jMinutes: number | null;
  enviesResistees: number;
  /** SOS envie par technique de respiration, la plus efficace d'abord. */
  techniquesSos: BilanTechnique[];
  cafeine: SuiviCafeine;
  /** « Où j'en suis » : étape de la méthode et prochaine action (RM-32). */
  parcours: Parcours;
  depuisDerniereMinutes: number | null;
  plusLonguePauseMinutes: number;
  /** Plus longue pause d'éveil aujourd'hui (pause en cours comprise, nuit exclue). */
  plusLonguePauseJourMinutes: number;
  /** Nuit terminée par la première cigarette d'aujourd'hui ; `null` avant la première. */
  derniereNuit: Nuit | null;
  /** Moyenne des 7 dernières nuits (minutes). */
  moyenneNuitsMinutes: number | null;
  economieJourCents: number;
  economieTotaleCents: number;
  projection: Projection;
  dateDuZero: LocalDate | null;
  patch: EtatPatch;
  /** Prises du jour par forme, avec l'heure et le dosage de la dernière prise (toutes journées confondues). */
  oraux: (EtatOral & { derniereA: Instant | null; dernierDosageMg: number | null })[];
  objectifs: { libelle: string; montantCents: number; joursRestants: number | null }[];
  proposerPalier: boolean;
  /** Analyse des 14 derniers jours (déclencheurs, heures à risque). */
  analyse: Analyse;
  /** Contextes personnels à proposer dans la feuille de contexte. */
  contextesPerso: ContextePerso[];
  /** Raisons personnelles d'arrêter, rappelées pendant le SOS envie. */
  raisons: string[];
  /** Fenêtre de comptage de la journée (pour les notifications). */
  fenetreJour: Fenetre;
  /** Début du comptage des économies du jour (fenêtre, ou démarrage du plan le jour 0). */
  debutJournee: Instant;
  derniereCigaretteId: string | null;
  /** Consentement au coach IA (F7.6). */
  coachIa: boolean;
}

export function tableauDeBord(etat: EtatJournal, maintenant: Instant, tz: string, ref: ReferencePharma): TableauDeBord {
  const jour = journeeCourante(etat, maintenant, tz);
  const plan = etat.plan;
  const toutes = etat.cigarettes.map((c) => c.a);
  const derniere = toutes.length > 0 ? Math.max(...toutes) : null;
  const duJour = fumeesDuJour(etat, jour);
  const horaires = plan?.horaires ?? HORAIRES_PAR_DEFAUT;
  const ouvertes = elementsDuJour(etat.cigarettes, jour).map((c) => c.a);
  const fenetre = fenetreDuJour(jour, horaires, ouvertes.length > 0 ? debutEveil(ouvertes) : null, tz);

  const toutesNuits = nuits(etat.cigarettes);
  const intervallesJour = intervallesEveilles(elementsDuJour(etat.cigarettes, jour), SEUIL_NUIT_MINUTES);
  const sansHeureCigarettes = sansHeureDuJour(etat, jour, 'cigarettes');
  /** Comptées pour le quota : hors cigarettes d'avant le démarrage du plan (RM-13). */
  const comptees = duJour.length + sansHeureCigarettes;
  const commun = {
    jour,
    fumees: comptees,
    fumeesJournee: elementsDuJour(etat.cigarettes, jour).length + sansHeureCigarettes,
    enviesSignalees:
      elementsDuJour(etat.enviesSignalees, jour).length + sansHeureDuJour(etat, jour, 'envies-signalees'),
    intervalleMoyenJourMinutes: moyenne(intervallesJour),
    plusLonguePauseJourMinutes: Math.round(
      Math.max(
        0,
        ...intervallesJour,
        ouvertes.length > 0 && (maintenant - Math.max(...ouvertes)) / 60_000 < SEUIL_NUIT_MINUTES ? (maintenant - Math.max(...ouvertes)) / 60_000 : 0,
      ),
    ),
    derniereNuit: toutesNuits.find((n) => n.jour === jour) ?? null,
    moyenneNuitsMinutes: moyenne(toutesNuits.slice(-7).map((n) => n.minutes)),
    intervallesJourMinutes: intervallesJour,
    derniereDuJourA: ouvertes.length > 0 ? Math.max(...ouvertes) : null,
    intervalleMoyen7jMinutes:
      mesurerHabitudes(etat.cigarettes, jour, tz, { sansHeure: cigarettesSansHeureParJour(etat) })?.intervalleMoyenMinutes ?? null,
    enviesResistees: elementsDuJour(etat.envies, jour).length,
    techniquesSos: bilanTechniques(etat.envies, etat.enviesSignalees),
    cafeine: suiviCafeine(etat, jour),
    parcours: ouJenSuis(etat, maintenant, tz),
    depuisDerniereMinutes: derniere === null ? null : Math.max(0, minutesBetween(derniere, maintenant)),
    patch: etatPatch(etat.patch, maintenant),
    oraux: (['pastille', 'gomme'] as const).map((forme) => {
      const prises = etat.oraux.filter((o) => o.forme === forme);
      const derniere = prises.reduce<(typeof prises)[number] | null>((m, o) => (m === null || o.a >= m.a ? o : m), null);
      return {
        ...etatOral(forme, prises.filter((o) => o.jour === jour).length, ref),
        derniereA: derniere?.a ?? null,
        dernierDosageMg: derniere?.dosageMg ?? null,
      };
    }),
    analyse: analyser(
      etat.cigarettes.filter((c) => daysBetween(c.jour, jour) <= 14),
      tz,
      3,
      etat.contextesPerso,
    ),
    contextesPerso: etat.contextesPerso.filter((c) => !c.archive),
    raisons: etat.raisons,
    fenetreJour: fenetre,
    derniereCigaretteId: etat.derniereCigaretteId,
    coachIa: etat.coachIa,
  };
  const prixJour = prixDuJour(etat.prix, jour);

  // Observation : pas de quota, pas d'économies.
  if (!plan) {
    return {
      ...commun,
      phase: 'observation',
      jourDuPlan: null,
      observation: proposerPlan(etat, maintenant, tz),
      quota: null,
      restant: null,
      prochaine: prochaineCigarette({
        maintenant,
        quota: Number.POSITIVE_INFINITY,
        fumeesAujourdhui: duJour.map((c) => c.a),
        intervalleMinutes: etat.intervalleRecommande,
      }),
      sourceIntervalle: 'habitude',
      respect: respectIntervalle(
        duJour.map((c) => c.a),
        etat.intervalleRecommande,
      ),
      intervalleCibleMinutes: null,
      plusLonguePauseMinutes: plusLonguePauseMinutes(toutes, maintenant, Math.min(etat.profilCreeLe, maintenant)),
      economieJourCents: 0,
      economieTotaleCents: 0,
      projection: projectionArret(etat.declare, prixJour),
      dateDuZero: null,
      objectifs: etat.objectifs.map((o) => ({ ...o, joursRestants: null })),
      proposerPalier: false,
      debutJournee: fenetre.start,
    };
  }

  const jourDuPlan = daysBetween(plan.input.dateDebut, jour);
  const quotaPlan = quotaDuJour(plan.input, jour);
  const quota = quotaEffectif(etat, jour);
  const p0 = jour === plan.input.dateDebut ? premierJourPartiel(etat) : null;
  const intervalle = intervalleCibleMinutes(dureeActive(horaires), quotaPlan);

  const historique = historiqueQuotidien(etat, jour);
  const economieJour =
    jourDuPlan < 0
      ? 0
      : economieEnCoursCents({
          initial: plan.reference,
          fumees: duJour.length,
          prix: prixJour,
          fenetre,
          maintenant,
          debutComptage: p0?.debut,
        });
  const economieTotale = historique.reduce((s, l) => s + l.economieCents, 0) + economieJour;

  const sansTabacMinutes = commun.depuisDerniereMinutes ?? Math.max(0, minutesBetween(plan.demarreLe, maintenant));
  const phase: Phase =
    jourDuPlan < 0 ? 'avant-debut' : quotaPlan > 0 ? 'reduction' : sansTabacMinutes < 7 * 24 * 60 ? 'arret' : 'maintien';

  const hier = historique[historique.length - 1];
  // Rythme d'épargne : moyenne des 7 dernières journées, sinon l'économie prévue par le quota du jour.
  const recents = historique.slice(-7);
  const rythme =
    recents.length > 0
      ? recents.reduce((s, l) => s + l.economieCents, 0) / recents.length
      : economieJourneeCents(plan.reference, quotaPlan, prixJour);

  return {
    ...commun,
    phase,
    jourDuPlan,
    observation: null,
    quota,
    restant: Math.max(0, quota - comptees),
    sourceIntervalle: 'plan',
    respect: respectIntervalle(
      duJour.map((c) => c.a),
      intervalle,
    ),
    prochaine: prochaineCigarette({
      maintenant,
      quota,
      fumeesAujourdhui: duJour.map((c) => c.a),
      intervalleMinutes: intervalle,
    }),
    intervalleCibleMinutes: intervalle,
    plusLonguePauseMinutes: plusLonguePauseMinutes(toutes, maintenant, Math.min(plan.demarreLe, maintenant)),
    economieJourCents: economieJour,
    economieTotaleCents: economieTotale,
    projection: projectionArret(plan.reference, prixJour),
    dateDuZero: dateDuZero(plan.input),
    objectifs: etat.objectifs.map((o) => ({
      ...o,
      joursRestants: joursAvantObjectif(o.montantCents, economieTotale, rythme),
    })),
    proposerPalier: hier !== undefined && hier.fumees > hier.quota && !plan.input.paliers.includes(jour),
    debutJournee: p0?.debut ?? fenetre.start,
  };
}


/** Instant de l'heure habituelle de début d'une journée (message du matin). */
export const debutHabituelDe = (etat: EtatJournal, jour: LocalDate, tz: string): Instant =>
  zonedInstant(jour, (etat.plan?.horaires ?? HORAIRES_PAR_DEFAUT).wake, tz);

// Façade : les modules qui importent depuis « ./dashboard » continuent de tout trouver ici.
export * from './etat';
export * from './journees';
export * from './historique';

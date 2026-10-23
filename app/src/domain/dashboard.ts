/**
 * Projections : on rejoue le journal d'événements pour obtenir l'état,
 * puis on calcule le tableau de bord de la journée en cours (ADR-0003, CQRS léger).
 *
 * Les journées sont définies par les cigarettes (RM-14, ADR-0008), pas par l'horloge.
 */

import { analyser, type Analyse } from './analyse';
import { effectiveEvents, instantOf, type ContexteCigarette, type DomainEvent, type TypeSubstitutOral } from './events';
import { DUREE_ACTIVE_PAR_DEFAUT, mesurerHabitudes, type Habitudes } from './habitudes';
import { intervalleCibleMinutes, plusLonguePauseMinutes, prochaineCigarette, type StatutProchaine } from './intervals';
import { dateDuZero, quotaDuJour, quotas, MOINS_UN_PAR_JOUR, type PlanInput } from './reduction';
import {
  economieEnCoursCents,
  economieJourneeCents,
  joursAvantObjectif,
  prixDuJour,
  projectionArret,
  valeurCents,
  type Prix,
  type Projection,
} from './savings';
import { etiqueterCigarettes, intervallesEveilles, journeeDe, moyenne, SEUIL_NUIT_MINUTES } from './sessions';
import { etatOral, etatPatch, type EtatOral, type EtatPatch, type PatchEnCours, type ReferencePharma } from './substitutes';
import {
  addDays,
  awakeWindow,
  daysBetween,
  localDateOf,
  minutesBetween,
  zonedInstant,
  type Fenetre,
  type Horaires,
  type Instant,
  type LocalDate,
  type TimeOfDay,
} from './time';

/** Durée de l'observation (RM-15), en journées terminées. */
export const JOURS_OBSERVATION = 3;
/** Horaires par défaut quand rien n'est mesuré (démarrage sans observation). */
export const HORAIRES_PAR_DEFAUT: Horaires = { wake: '07:00', bed: '23:00' };

export interface CigaretteJournal {
  id: string;
  a: Instant;
  jour: LocalDate;
  contexte?: ContexteCigarette;
}

export interface PlanEnCours {
  input: PlanInput;
  /** Consommation de référence, base des économies (RM-07). */
  reference: number;
  /** Heures habituelles de la première et de la dernière cigarette. */
  horaires: Horaires;
  demarreLe: Instant;
  origine: 'observation' | 'declaration';
}

export interface EtatJournal {
  declare: number;
  profilCreeLe: Instant;
  dejaFumeAujourdhui: boolean;
  prix: Prix[];
  plan: PlanEnCours | null;
  cigarettes: CigaretteJournal[];
  envies: { a: Instant; jour: LocalDate }[];
  patch: PatchEnCours | null;
  oraux: { a: Instant; jour: LocalDate; forme: TypeSubstitutOral }[];
  objectifs: { libelle: string; montantCents: number }[];
  /** Dernier événement saisi par l'utilisateur (pour « annuler »). */
  derniereSaisieId: string | null;
  derniereCigaretteId: string | null;
}

const SAISIES: ReadonlySet<DomainEvent['type']> = new Set([
  'CigaretteFumee',
  'EnvieResistee',
  'PatchPose',
  'PatchRetire',
  'SubstitutOralPris',
]);

/** Rejoue le journal. `null` tant que le profil n'existe pas. */
export function rejouer(events: readonly DomainEvent[], tz: string): EtatJournal | null {
  const evs = effectiveEvents(events);
  const profil = evs.find((e) => e.type === 'ProfilCree');
  if (!profil || profil.type !== 'ProfilCree') return null;
  const creeLe = instantOf(profil);

  const etat: EtatJournal = {
    declare: profil.payload.cigarettesParJour,
    profilCreeLe: creeLe,
    dejaFumeAujourdhui: profil.payload.dejaFumeAujourdhui,
    prix: [
      {
        aPartirDu: localDateOf(creeLe, profil.tz),
        prixPaquetCents: profil.payload.prixPaquetCents,
        cigarettesParPaquet: profil.payload.cigarettesParPaquet,
      },
    ],
    plan: null,
    cigarettes: [],
    envies: [],
    patch: null,
    oraux: [],
    objectifs: [],
    derniereSaisieId: null,
    derniereCigaretteId: null,
  };

  // 1. Cigarettes, avec leurs corrections (contexte, heure réelle), puis étiquetage des journées.
  const corrections = new Map<string, { contexte?: ContexteCigarette; occurredAt?: string }>();
  for (const e of evs) {
    if (e.type === 'CigaretteCorrigee') {
      const { evenementId, ...champs } = e.payload;
      corrections.set(evenementId, { ...corrections.get(evenementId), ...champs });
    }
  }
  const brutes: Omit<CigaretteJournal, 'jour'>[] = [];
  for (const e of evs) {
    if (e.type !== 'CigaretteFumee') continue;
    const c = corrections.get(e.id);
    const contexte = c?.contexte ?? e.payload.contexte;
    brutes.push({ id: e.id, a: c?.occurredAt ? Date.parse(c.occurredAt) : instantOf(e), ...(contexte ? { contexte } : {}) });
    etat.derniereCigaretteId = e.id;
  }
  brutes.sort((x, y) => x.a - y.a);
  const jours = etiqueterCigarettes(
    brutes.map((c) => c.a),
    tz,
  );
  etat.cigarettes = brutes.map((c, i) => ({ ...c, jour: jours[i]! }));

  // 2. Autres événements.
  const rythmes: PlanInput['rythmes'][number][] = [];
  const paliers: LocalDate[] = [];
  for (const e of evs) {
    const a = instantOf(e);
    if (SAISIES.has(e.type)) etat.derniereSaisieId = e.id;
    switch (e.type) {
      case 'PlanDemarre':
        if (etat.plan) break; // un seul démarrage
        rythmes.push({ aPartirDu: e.payload.dateDebut, strategie: e.payload.strategie ?? MOINS_UN_PAR_JOUR });
        etat.plan = {
          input: { initial: e.payload.quotaDepart, dateDebut: e.payload.dateDebut, rythmes, paliers },
          reference: e.payload.referenceParJour,
          horaires: { wake: e.payload.debutHabituel, bed: e.payload.finHabituelle },
          demarreLe: a,
          origine: e.payload.origine,
        };
        break;
      case 'RythmeModifie':
        rythmes.push({ aPartirDu: e.payload.aPartirDu, strategie: e.payload.strategie });
        break;
      case 'PalierDemande':
        paliers.push(e.payload.jour);
        break;
      case 'PrixModifie':
        etat.prix.push({
          aPartirDu: e.payload.aPartirDu,
          prixPaquetCents: e.payload.prixPaquetCents,
          cigarettesParPaquet: e.payload.cigarettesParPaquet,
        });
        break;
      case 'EnvieResistee':
        etat.envies.push({ a, jour: journeeDe(a, etat.cigarettes, tz) });
        break;
      case 'PatchPose':
        etat.patch = { poseLe: a, dosageMg: e.payload.dosageMg, dureePortHeures: e.payload.dureePortHeures };
        break;
      case 'PatchRetire':
        etat.patch = null;
        break;
      case 'SubstitutOralPris':
        etat.oraux.push({ a, jour: journeeDe(a, etat.cigarettes, tz), forme: e.payload.forme });
        break;
      case 'ObjectifEpargneDefini':
        etat.objectifs.push({ libelle: e.payload.libelle, montantCents: e.payload.montantCents });
        break;
      default:
        break;
    }
  }
  return etat;
}

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
  const habitudes = mesurerHabitudes(etat.cigarettes, jour, tz, { depuis: debutObservation(etat, tz) });
  const joursMesures = habitudes?.joursMesures ?? 0;
  const terminee = joursMesures >= JOURS_OBSERVATION;
  const journeeEntamee = etat.cigarettes.some((c) => c.jour === jour);
  const reference = terminee && habitudes ? Math.max(1, Math.round(habitudes.cigarettesParJour)) : etat.declare;
  return {
    joursMesures,
    joursRequis: JOURS_OBSERVATION,
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
  const avant = etat.cigarettes.filter((c) => c.jour === plan.input.dateDebut && c.a < plan.demarreLe);
  if (avant.length === 0) return null;
  const premiere = Math.min(...avant.map((c) => c.a));
  const ecoule = minutesBetween(premiere, plan.demarreLe);
  return { debut: plan.demarreLe, fraction: Math.min(1, Math.max(0, 1 - ecoule / dureeActive(plan.horaires))) };
}

/** Cigarettes comptées pour une journée du plan (hors cigarettes d'avant le démarrage). */
function fumeesDuJour(etat: EtatJournal, jour: LocalDate): CigaretteJournal[] {
  const plan = etat.plan;
  return etat.cigarettes.filter(
    (c) => c.jour === jour && (!plan || jour !== plan.input.dateDebut || c.a >= plan.demarreLe),
  );
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
    const fumees = fumeesDuJour(etat, jour).length;
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
function fenetreDuJour(jour: LocalDate, horaires: Horaires, premiere: Instant | null, tz: string): Fenetre {
  const habituelle = awakeWindow(jour, horaires, tz);
  const start = premiere === null ? habituelle.start : Math.min(premiere, habituelle.start);
  return { start, end: start + (habituelle.end - habituelle.start) };
}

/* ------------------------------------------------------------------ */
/* Tableau de bord                                                      */
/* ------------------------------------------------------------------ */

export type Phase = 'observation' | 'avant-debut' | 'reduction' | 'arret' | 'maintien';

export interface TableauDeBord {
  jour: LocalDate;
  phase: Phase;
  /** Jour du plan, 0 = premier jour ; `null` pendant l'observation. */
  jourDuPlan: number | null;
  observation: EtatObservation | null;
  quota: number | null;
  fumees: number;
  restant: number | null;
  prochaine: StatutProchaine | null;
  /**
   * Origine de l'intervalle du compte à rebours : le plan, ou pendant l'observation le rythme
   * habituel (intervalle moyen mesuré, sinon déclaration) — indicatif, rien n'est imposé.
   */
  sourceIntervalle: 'plan' | 'habitude';
  intervalleCibleMinutes: number | null;
  /** Intervalle moyen entre deux cigarettes aujourd'hui (nuit exclue). */
  intervalleMoyenJourMinutes: number | null;
  /** Intervalle moyen sur les 7 dernières journées terminées. */
  intervalleMoyen7jMinutes: number | null;
  enviesResistees: number;
  depuisDerniereMinutes: number | null;
  plusLonguePauseMinutes: number;
  economieJourCents: number;
  economieTotaleCents: number;
  projection: Projection;
  dateDuZero: LocalDate | null;
  patch: EtatPatch;
  oraux: EtatOral[];
  objectifs: { libelle: string; montantCents: number; joursRestants: number | null }[];
  proposerPalier: boolean;
  /** Analyse des 14 derniers jours (déclencheurs, heures à risque). */
  analyse: Analyse;
  /** Fenêtre de comptage de la journée (pour les notifications). */
  fenetreJour: Fenetre;
  /** Début du comptage des économies du jour (fenêtre, ou démarrage du plan le jour 0). */
  debutJournee: Instant;
  derniereCigaretteId: string | null;
}

export function tableauDeBord(etat: EtatJournal, maintenant: Instant, tz: string, ref: ReferencePharma): TableauDeBord {
  const jour = journeeCourante(etat, maintenant, tz);
  const plan = etat.plan;
  const toutes = etat.cigarettes.map((c) => c.a);
  const derniere = toutes.length > 0 ? Math.max(...toutes) : null;
  const duJour = fumeesDuJour(etat, jour);
  const horaires = plan?.horaires ?? HORAIRES_PAR_DEFAUT;
  const ouvertes = etat.cigarettes.filter((c) => c.jour === jour).map((c) => c.a);
  const fenetre = fenetreDuJour(jour, horaires, ouvertes.length > 0 ? Math.min(...ouvertes) : null, tz);

  const commun = {
    jour,
    fumees: duJour.length,
    intervalleMoyenJourMinutes: moyenne(
      intervallesEveilles(
        etat.cigarettes.filter((c) => c.jour === jour),
        SEUIL_NUIT_MINUTES,
      ),
    ),
    intervalleMoyen7jMinutes: mesurerHabitudes(etat.cigarettes, jour, tz)?.intervalleMoyenMinutes ?? null,
    enviesResistees: etat.envies.filter((e) => e.jour === jour).length,
    depuisDerniereMinutes: derniere === null ? null : Math.max(0, minutesBetween(derniere, maintenant)),
    patch: etatPatch(etat.patch, maintenant),
    oraux: (['pastille', 'gomme'] as const).map((forme) =>
      etatOral(forme, etat.oraux.filter((o) => o.jour === jour && o.forme === forme).length, ref),
    ),
    analyse: analyser(
      etat.cigarettes.filter((c) => daysBetween(c.jour, jour) <= 14),
      tz,
    ),
    fenetreJour: fenetre,
    derniereCigaretteId: etat.derniereCigaretteId,
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
        intervalleMinutes: rythmeHabituel(etat, commun.intervalleMoyenJourMinutes, commun.intervalleMoyen7jMinutes),
      }),
      sourceIntervalle: 'habitude',
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
    restant: Math.max(0, quota - duJour.length),
    sourceIntervalle: 'plan',
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

/** Rythme habituel pendant l'observation : moyenne du jour, sinon des 7 jours, sinon la déclaration. */
function rythmeHabituel(etat: EtatJournal, jour: number | null, septJours: number | null): number | null {
  if (jour !== null && jour > 0) return jour;
  if (septJours !== null && septJours > 0) return septJours;
  return etat.declare > 1 ? DUREE_ACTIVE_PAR_DEFAUT / (etat.declare - 1) : null;
}

/** Instant de l'heure habituelle de début d'une journée (message du matin). */
export const debutHabituelDe = (etat: EtatJournal, jour: LocalDate, tz: string): Instant =>
  zonedInstant(jour, (etat.plan?.horaires ?? HORAIRES_PAR_DEFAUT).wake, tz);

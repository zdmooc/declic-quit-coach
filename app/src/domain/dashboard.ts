/**
 * Projections : on rejoue le journal d'événements pour obtenir l'état,
 * puis on calcule le tableau de bord de la journée en cours (ADR-0003, CQRS léger).
 *
 * Les journées sont définies par les cigarettes (RM-14, ADR-0008), pas par l'horloge.
 */

import { analyser, libelleContexte, type Analyse, type ContextePerso } from './analyse';
import { effectiveEvents, instantOf, type ContexteCigarette, type DomainEvent, type PrecisionHeure, type TypeSubstitutOral } from './events';
import { DUREE_ACTIVE_PAR_DEFAUT, mesurerHabitudes, type Habitudes } from './habitudes';
import {
  intervalleCibleMinutes,
  plusLonguePauseMinutes,
  prochaineCigarette,
  respectIntervalle,
  TOLERANCE_INTERVALLE_MINUTES,
  type RespectIntervalle,
  type StatutProchaine,
} from './intervals';
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
import { bilanTechniques, type BilanTechnique } from './respiration';
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
  /** Absente = exacte (saisie en direct). */
  precision?: PrecisionHeure;
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
  envies: { a: Instant; jour: LocalDate; strategie?: string }[];
  /** Envies signalées (distinctes des envies résistées), avec leur issue. */
  enviesSignalees: { a: Instant; jour: LocalDate; issue: 'resistee' | 'cigarette' | 'inconnue'; technique?: string }[];
  /** Saisies historiques sans heure connue (agrégats par journée). */
  sansHeure: { jour: LocalDate; nature: 'cigarettes' | 'envies-signalees'; nombre: number }[];
  patch: PatchEnCours | null;
  /** Historique des patchs : pose, dosage, durée prévue, retrait. */
  patchs: { poseLe: Instant; dosageMg: number; dureePortHeures: 16 | 24; retireLe: Instant | null }[];
  oraux: { a: Instant; jour: LocalDate; forme: TypeSubstitutOral; dosageMg: number }[];
  objectifs: { libelle: string; montantCents: number }[];
  /** Contextes ajoutés par l'utilisateur (RM-16). */
  contextesPerso: ContextePerso[];
  /** Intervalle recommandé pendant l'observation (réglage). */
  intervalleRecommande: number;
  /** Journées mesurées avant de proposer le plan (1 à 7, 3 par défaut). */
  joursObservation: number;
  /** Raisons personnelles d'arrêter (SOS envie). */
  raisons: string[];
  /** Consentement à l'envoi d'un résumé non identifiant au coach IA (F1.6, F7.6). */
  coachIa: boolean;
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
    enviesSignalees: [],
    sansHeure: [],
    patch: null,
    patchs: [],
    oraux: [],
    objectifs: [],
    contextesPerso: [],
    intervalleRecommande: INTERVALLE_RECOMMANDE_OBSERVATION_MINUTES,
    joursObservation: JOURS_OBSERVATION,
    raisons: [],
    coachIa: false,
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
  const brutes: (Omit<CigaretteJournal, 'jour'> & { journee?: LocalDate })[] = [];
  for (const e of evs) {
    if (e.type !== 'CigaretteFumee') continue;
    const c = corrections.get(e.id);
    const contexte = c?.contexte ?? e.payload.contexte;
    const { precision, journee } = e.payload;
    brutes.push({
      id: e.id,
      a: c?.occurredAt ? Date.parse(c.occurredAt) : instantOf(e),
      ...(contexte ? { contexte } : {}),
      // Une heure corrigée par l'utilisateur redevient exacte.
      ...(precision && precision !== 'exacte' && !c?.occurredAt ? { precision } : {}),
      ...(journee ? { journee } : {}),
    });
    etat.derniereCigaretteId = e.id;
  }
  brutes.sort((x, y) => x.a - y.a);
  const jours = etiqueterCigarettes(
    brutes.map((c) => c.a),
    tz,
    SEUIL_NUIT_MINUTES,
    brutes.map((c) => c.journee),
  );
  etat.cigarettes = brutes.map(({ journee: _j, ...c }, i) => ({ ...c, jour: jours[i]! }));

  // 2. Autres événements.
  const rythmes: PlanInput['rythmes'][number][] = [];
  const paliers: LocalDate[] = [];
  const fixes: { aPartirDu: LocalDate; quota: number }[] = [];
  for (const e of evs) {
    const a = instantOf(e);
    if (SAISIES.has(e.type)) etat.derniereSaisieId = e.id;
    switch (e.type) {
      case 'PlanDemarre':
        if (etat.plan) break; // un seul démarrage
        rythmes.push({ aPartirDu: e.payload.dateDebut, strategie: e.payload.strategie ?? MOINS_UN_PAR_JOUR });
        etat.plan = {
          input: { initial: e.payload.quotaDepart, dateDebut: e.payload.dateDebut, rythmes, paliers, fixes },
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
      case 'PalierFixe':
        fixes.push({ aPartirDu: e.payload.aPartirDu, quota: e.payload.quota });
        break;
      case 'PrixModifie':
        etat.prix.push({
          aPartirDu: e.payload.aPartirDu,
          prixPaquetCents: e.payload.prixPaquetCents,
          cigarettesParPaquet: e.payload.cigarettesParPaquet,
        });
        break;
      case 'EnvieResistee':
        etat.envies.push({
          a,
          jour: e.payload.journee ?? journeeDe(a, etat.cigarettes, tz),
          ...(e.payload.strategieUtilisee ? { strategie: e.payload.strategieUtilisee } : {}),
        });
        break;
      case 'EnvieSignalee':
        etat.enviesSignalees.push({
          a,
          jour: e.payload.journee ?? journeeDe(a, etat.cigarettes, tz),
          issue: e.payload.issue,
          ...(e.payload.technique ? { technique: e.payload.technique } : {}),
        });
        break;
      case 'AgregatSansHeure':
        etat.sansHeure.push({ jour: e.payload.journee, nature: e.payload.nature, nombre: e.payload.nombre });
        break;
      case 'PatchPose': {
        // Un nouveau patch remplace le précédent s'il n'a pas été déclaré retiré.
        const ouvert = etat.patchs.find((p) => p.retireLe === null);
        if (ouvert) ouvert.retireLe = a;
        etat.patch = { poseLe: a, dosageMg: e.payload.dosageMg, dureePortHeures: e.payload.dureePortHeures };
        etat.patchs.push({ ...etat.patch, retireLe: null });
        break;
      }
      case 'PatchRetire': {
        const ouvert = etat.patchs.find((p) => p.retireLe === null);
        if (ouvert) ouvert.retireLe = a;
        etat.patch = null;
        break;
      }
      case 'SubstitutOralPris':
        etat.oraux.push({ a, jour: journeeDe(a, etat.cigarettes, tz), forme: e.payload.forme, dosageMg: e.payload.dosageMg });
        break;
      case 'ObjectifEpargneDefini':
        etat.objectifs = etat.objectifs.filter((o) => o.libelle !== e.payload.libelle.trim());
        etat.objectifs.push({ libelle: e.payload.libelle.trim(), montantCents: e.payload.montantCents });
        break;
      case 'ObjectifRetire':
        etat.objectifs = etat.objectifs.filter((o) => o.libelle !== e.payload.libelle);
        break;
      case 'ConsentementModifie':
        if (e.payload.finalite === 'coach-ia') etat.coachIa = e.payload.accorde;
        break;
      case 'RaisonAjoutee':
        etat.raisons.push(e.payload.texte.trim());
        break;
      case 'ContexteRenomme': {
        const c = etat.contextesPerso.find((x) => x.cle === e.payload.cle);
        if (c) c.libelle = e.payload.libelle.trim();
        break;
      }
      case 'ContexteArchive': {
        const c = etat.contextesPerso.find((x) => x.cle === e.payload.cle);
        if (c) c.archive = true;
        break;
      }
      case 'ObservationReglee':
        etat.joursObservation = e.payload.jours;
        break;
      case 'IntervalleRecommandeModifie':
        etat.intervalleRecommande = e.payload.minutes;
        break;
      case 'ContexteAjoute':
        if (!etat.contextesPerso.some((c) => c.cle === e.payload.cle)) {
          etat.contextesPerso.push({ cle: e.payload.cle, libelle: e.payload.libelle.trim() });
        }
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
function fumeesDuJour(etat: EtatJournal, jour: LocalDate): CigaretteJournal[] {
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
function patchsDuJour(etat: EtatJournal, jour: LocalDate, tz: string): JourneeHistorique['patchs'] {
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
  depuisDerniereMinutes: number | null;
  plusLonguePauseMinutes: number;
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
    intervallesJourMinutes: intervallesJour,
    derniereDuJourA: ouvertes.length > 0 ? Math.max(...ouvertes) : null,
    intervalleMoyen7jMinutes:
      mesurerHabitudes(etat.cigarettes, jour, tz, { sansHeure: cigarettesSansHeureParJour(etat) })?.intervalleMoyenMinutes ?? null,
    enviesResistees: elementsDuJour(etat.envies, jour).length,
    techniquesSos: bilanTechniques(etat.envies, etat.enviesSignalees),
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

/** Intervalle recommandé pendant l'observation (indicatif, sans notification). */
export const INTERVALLE_RECOMMANDE_OBSERVATION_MINUTES = 60;

/** Instant de l'heure habituelle de début d'une journée (message du matin). */
export const debutHabituelDe = (etat: EtatJournal, jour: LocalDate, tz: string): Instant =>
  zonedInstant(jour, (etat.plan?.horaires ?? HORAIRES_PAR_DEFAUT).wake, tz);

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

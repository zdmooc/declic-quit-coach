/**
 * Événements du domaine : la source de vérité de l'application (ADR-0003).
 * Un événement n'est jamais modifié ; une correction passe par `SaisieAnnulee`.
 */

import type { LocalDate, TimeOfDay } from './time';
import type { ReductionStrategy } from './reduction';

export type EventSource = 'phone' | 'notification' | 'watch' | 'import';

/**
 * Précision de l'heure d'une saisie (schéma v2, champ facultatif : absent = exacte).
 * L'heure « inconnue » n'existe pas sur un événement horodaté : elle passe par un `AgregatSansHeure`.
 */
export type PrecisionHeure = 'exacte' | 'approximative';

/** Champs facultatifs des saisies importées d'un historique (schéma v2, rétrocompatible). */
export interface Provenance {
  precision?: PrecisionHeure;
  /**
   * Journée déclarée par la source (date locale). Prime sur la règle RM-14 quand la source
   * a explicitement rattaché la saisie à une journée.
   */
  journee?: LocalDate;
  /** Libellé libre de la source (ex. « journal Drive »), pour la traçabilité. */
  origine?: string;
  /** Note de la source (200 caractères au plus). */
  note?: string;
}

/** Contextes proposés par défaut. */
export type ContextePredefini = 'cafe' | 'stress' | 'repas' | 'alcool' | 'travail' | 'social' | 'ennui' | 'autre';

/** Contexte d'une cigarette : prédéfini, ou ajouté par l'utilisateur (« perso:<id> »). */
export type ContexteCigarette = ContextePredefini | `perso:${string}`;

export type TypeSubstitutOral = 'pastille' | 'gomme';

interface Base<T extends string, P> {
  /** UUID v7 (ordonnable dans le temps). */
  id: string;
  type: T;
  schemaVersion: 1;
  /** Instant de l'événement, ISO 8601 UTC. */
  occurredAt: string;
  /** Fuseau IANA de l'appareil au moment de l'événement. */
  tz: string;
  source: EventSource;
  payload: P;
}

/** Création du profil : démarre la phase d'observation (RM-15). */
export type ProfilCree = Base<
  'ProfilCree',
  {
    /** Consommation déclarée (estimation) ; la référence du plan est mesurée pendant l'observation. */
    cigarettesParJour: number;
    prixPaquetCents: number;
    cigarettesParPaquet: number;
    /** Si l'utilisateur a déjà fumé avant d'installer l'app, la journée en cours n'est pas mesurable. */
    dejaFumeAujourdhui: boolean;
  }
>;

/** Démarrage du plan, à l'issue de l'observation ou tout de suite. */
export type PlanDemarre = Base<
  'PlanDemarre',
  {
    dateDebut: LocalDate;
    strategie: ReductionStrategy;
    /** Consommation de référence (base des économies, RM-07). */
    referenceParJour: number;
    /** Quota du premier jour du plan (référence − 1). */
    quotaDepart: number;
    /** Heures habituelles de la première et de la dernière cigarette (mesurées ou par défaut). */
    debutHabituel: TimeOfDay;
    finHabituelle: TimeOfDay;
    origine: 'observation' | 'declaration';
  }
>;
export type RythmeModifie = Base<'RythmeModifie', { aPartirDu: LocalDate; strategie: ReductionStrategy }>;
export type PalierDemande = Base<'PalierDemande', { jour: LocalDate }>;
/** Palier choisi par l'utilisateur (descente libre) : jamais au-dessus du quota en cours. */
export type PalierFixe = Base<'PalierFixe', { aPartirDu: LocalDate; quota: number }>;

export type CigaretteFumee = Base<
  'CigaretteFumee',
  { contexte?: ContexteCigarette; intensiteEnvie?: 1 | 2 | 3 | 4 | 5 } & Provenance
>;
/**
 * Saisies historiques dont l'heure est inconnue : un nombre par journée, sans faux horodatage.
 * Elles comptent dans les totaux, jamais dans les intervalles ni les heures à risque.
 */
export type AgregatSansHeure = Base<
  'AgregatSansHeure',
  {
    journee: LocalDate;
    nature: 'cigarettes' | 'envies-signalees';
    nombre: number;
    /** Le nombre est un minimum (journée en cours, signalements possiblement incomplets). */
    auMoins?: boolean;
    /** Envies : dont devenues cigarettes. */
    devenuesCigarettes?: number;
    /** Envies : dont non concrétisées sur le moment (sans être confirmées « résistées »). */
    nonConcretiseesSurLeMoment?: number;
    note?: string;
    origine?: string;
  }
>;
/**
 * Envie signalée, distincte d'une envie résistée : son issue peut être une cigarette
 * ou rester inconnue (le journal ne l'a pas précisée).
 */
export type EnvieSignalee = Base<'EnvieSignalee', { issue: 'resistee' | 'cigarette' | 'inconnue'; /** Technique de respiration du SOS. */ technique?: string } & Provenance>;
/** Nouveau contexte saisi par l'utilisateur, proposé ensuite comme les autres (RM-16). */
export type ContexteAjoute = Base<'ContexteAjoute', { cle: `perso:${string}`; libelle: string }>;
export type ContexteRenomme = Base<'ContexteRenomme', { cle: `perso:${string}`; libelle: string }>;
/** Le contexte n'est plus proposé ; les cigarettes passées gardent leur libellé. */
export type ContexteArchive = Base<'ContexteArchive', { cle: `perso:${string}` }>;
/** Intervalle recommandé pendant l'observation (réglage, 60 min par défaut). */
export type IntervalleRecommandeModifie = Base<'IntervalleRecommandeModifie', { minutes: number }>;
/** Durée de l'observation choisie par l'utilisateur (1 à 7 journées mesurées). */
export type ObservationReglee = Base<'ObservationReglee', { jours: number }>;
/** Une raison personnelle d'arrêter, rappelée pendant le SOS envie (F7.1). */
export type RaisonAjoutee = Base<'RaisonAjoutee', { texte: string }>;
export type EnvieResistee = Base<'EnvieResistee', { strategieUtilisee?: string; /** Contexte de l'envie (parades). */ contexte?: ContexteCigarette } & Provenance>;
/** Nouveau réflexe choisi pour remplacer la cigarette dans un contexte (vide = retiré). */
export type ParadeDefinie = Base<'ParadeDefinie', { contexte: ContexteCigarette; parade: string }>;
export type SaisieAnnulee = Base<'SaisieAnnulee', { evenementId: string }>;
/** Précise une cigarette après coup : contexte (RM-16) et/ou heure réelle. */
export type CigaretteCorrigee = Base<
  'CigaretteCorrigee',
  { evenementId: string; contexte?: ContexteCigarette; occurredAt?: string }
>;

export type PatchPose = Base<'PatchPose', { dosageMg: number; dureePortHeures: 16 | 24; site?: string } & Provenance>;
export type PatchRetire = Base<'PatchRetire', Provenance>;
export type SubstitutOralPris = Base<'SubstitutOralPris', { forme: TypeSubstitutOral; dosageMg: number }>;

export type PrixModifie = Base<
  'PrixModifie',
  { prixPaquetCents: number; cigarettesParPaquet: number; aPartirDu: LocalDate }
>;
export type ObjectifEpargneDefini = Base<'ObjectifEpargneDefini', { libelle: string; montantCents: number }>;
/** Objectif atteint ou abandonné : il n'est plus affiché (F5.4). */
export type ObjectifRetire = Base<'ObjectifRetire', { libelle: string }>;
export type ConsentementModifie = Base<
  'ConsentementModifie',
  { finalite: 'donnees-sante' | 'notifications' | 'coach-ia' | 'montre' | 'statistiques'; accorde: boolean }
>;

export type DomainEvent =
  | ProfilCree
  | PlanDemarre
  | RythmeModifie
  | PalierDemande
  | PalierFixe
  | CigaretteFumee
  | AgregatSansHeure
  | EnvieSignalee
  | EnvieResistee
  | SaisieAnnulee
  | CigaretteCorrigee
  | ContexteAjoute
  | RaisonAjoutee
  | ContexteRenomme
  | ContexteArchive
  | IntervalleRecommandeModifie
  | ObservationReglee
  | ParadeDefinie
  | PatchPose
  | PatchRetire
  | SubstitutOralPris
  | PrixModifie
  | ObjectifEpargneDefini
  | ObjectifRetire
  | ConsentementModifie;

export type EventType = DomainEvent['type'];

export const instantOf = (e: DomainEvent): number => Date.parse(e.occurredAt);

/**
 * Événements effectifs : retire les événements annulés et trie par instant
 * (puis par ordre d'ajout au journal).
 */
export function effectiveEvents(events: readonly DomainEvent[]): DomainEvent[] {
  const cancelled = new Set(
    events.filter((e): e is SaisieAnnulee => e.type === 'SaisieAnnulee').map((e) => e.payload.evenementId),
  );
  // À instant égal, l'ordre d'ajout au journal fait foi (tri stable) : deux saisies
  // dans la même milliseconde ne doivent pas dépendre de l'aléa des identifiants.
  return events
    .map((e, rang) => ({ e, rang }))
    .filter(({ e }) => e.type !== 'SaisieAnnulee' && !cancelled.has(e.id))
    .sort((a, b) => instantOf(a.e) - instantOf(b.e) || a.rang - b.rang)
    .map(({ e }) => e);
}

/** Valide les invariants simples d'un événement avant son ajout au journal. */
export function validateEvent(e: DomainEvent): string[] {
  const errors: string[] = [];
  if (!e.id) errors.push('id manquant');
  if (Number.isNaN(Date.parse(e.occurredAt))) errors.push('occurredAt invalide');
  if (!e.tz) errors.push('tz manquant');
  const isInt = (n: number) => Number.isInteger(n);
  switch (e.type) {
    case 'ProfilCree':
      if (!isInt(e.payload.cigarettesParJour) || e.payload.cigarettesParJour < 1 || e.payload.cigarettesParJour > 100)
        errors.push('cigarettesParJour doit être un entier entre 1 et 100');
      if (!isInt(e.payload.prixPaquetCents) || e.payload.prixPaquetCents <= 0) errors.push('prixPaquetCents invalide');
      if (!isInt(e.payload.cigarettesParPaquet) || e.payload.cigarettesParPaquet <= 0)
        errors.push('cigarettesParPaquet invalide');
      break;
    case 'PlanDemarre':
      if (!isInt(e.payload.referenceParJour) || e.payload.referenceParJour < 1) errors.push('referenceParJour invalide');
      if (!isInt(e.payload.quotaDepart) || e.payload.quotaDepart < 0 || e.payload.quotaDepart > e.payload.referenceParJour)
        errors.push('quotaDepart invalide');
      break;
    case 'CigaretteCorrigee':
      if (e.payload.occurredAt !== undefined && Number.isNaN(Date.parse(e.payload.occurredAt)))
        errors.push('occurredAt corrigé invalide');
      break;
    case 'ContexteAjoute':
      if (!e.payload.cle.startsWith('perso:')) errors.push('clé de contexte invalide');
      if (e.payload.libelle.trim().length < 1 || e.payload.libelle.trim().length > 30)
        errors.push('libellé de contexte : 1 à 30 caractères');
      break;
    case 'ContexteRenomme':
      if (e.payload.libelle.trim().length < 1 || e.payload.libelle.trim().length > 30)
        errors.push('libellé de contexte : 1 à 30 caractères');
      break;
    case 'ParadeDefinie':
      if (typeof e.payload.contexte !== 'string' || e.payload.contexte.length === 0) errors.push('contexte manquant');
      if (typeof e.payload.parade !== 'string' || e.payload.parade.length > 60) errors.push('parade : 60 caractères au plus');
      break;
    case 'ObservationReglee':
      if (!isInt(e.payload.jours) || e.payload.jours < 1 || e.payload.jours > 7) errors.push('observation : 1 à 7 jours');
      break;
    case 'IntervalleRecommandeModifie':
      if (!isInt(e.payload.minutes) || e.payload.minutes < 10 || e.payload.minutes > 240)
        errors.push('intervalle recommandé : 10 à 240 minutes');
      break;
    case 'RaisonAjoutee':
      if (e.payload.texte.trim().length < 1 || e.payload.texte.trim().length > 120) errors.push('raison : 1 à 120 caractères');
      break;
    case 'PrixModifie':
      if (!isInt(e.payload.prixPaquetCents) || e.payload.prixPaquetCents <= 0) errors.push('prixPaquetCents invalide');
      if (!isInt(e.payload.cigarettesParPaquet) || e.payload.cigarettesParPaquet <= 0)
        errors.push('cigarettesParPaquet invalide');
      break;
    case 'ObjectifEpargneDefini':
      if (!isInt(e.payload.montantCents) || e.payload.montantCents <= 0) errors.push('montantCents invalide');
      if (e.payload.libelle.trim().length < 1 || e.payload.libelle.trim().length > 40) errors.push('objectif : 1 à 40 caractères');
      break;
    case 'SubstitutOralPris':
    case 'PatchPose':
      if (!(e.payload.dosageMg > 0)) errors.push('dosageMg invalide');
      break;
    case 'PalierFixe':
      if (!isInt(e.payload.quota) || e.payload.quota < 0 || e.payload.quota > 100) errors.push('palier : entier de 0 à 100');
      break;
    case 'AgregatSansHeure':
      if (!/^\d{4}-\d{2}-\d{2}$/.test(e.payload.journee)) errors.push('journée invalide');
      if (e.payload.nature !== 'cigarettes' && e.payload.nature !== 'envies-signalees') errors.push('nature invalide');
      if (!isInt(e.payload.nombre) || e.payload.nombre < 1 || e.payload.nombre > 100) errors.push('nombre : entier de 1 à 100');
      for (const n of [e.payload.devenuesCigarettes, e.payload.nonConcretiseesSurLeMoment])
        if (n !== undefined && (!isInt(n) || n < 0 || n > e.payload.nombre)) errors.push('sous-total d’envies invalide');
      break;
    case 'EnvieSignalee':
      if (!['resistee', 'cigarette', 'inconnue'].includes(e.payload.issue)) errors.push('issue invalide');
      if (e.payload.technique !== undefined && (typeof e.payload.technique !== 'string' || e.payload.technique.length > 40)) errors.push('technique invalide');
      break;
    default:
      break;
  }
  // Champs de provenance (schéma v2), communs aux saisies importées.
  const p = e.payload as Provenance;
  if (p.precision !== undefined && p.precision !== 'exacte' && p.precision !== 'approximative') errors.push('précision invalide');
  if (p.journee !== undefined && e.type !== 'AgregatSansHeure' && !/^\d{4}-\d{2}-\d{2}$/.test(p.journee)) errors.push('journée invalide');
  if (p.note !== undefined && (typeof p.note !== 'string' || p.note.length > 200)) errors.push('note : 200 caractères au plus');
  return errors;
}

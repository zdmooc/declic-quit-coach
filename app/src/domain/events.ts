/**
 * Événements du domaine : la source de vérité de l'application (ADR-0003).
 * Un événement n'est jamais modifié ; une correction passe par `SaisieAnnulee`.
 */

import type { LocalDate, TimeOfDay } from './time';
import type { ReductionStrategy } from './reduction';

export type EventSource = 'phone' | 'notification' | 'watch';

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

export type CigaretteFumee = Base<
  'CigaretteFumee',
  { contexte?: ContexteCigarette; intensiteEnvie?: 1 | 2 | 3 | 4 | 5 }
>;
/** Nouveau contexte saisi par l'utilisateur, proposé ensuite comme les autres (RM-16). */
export type ContexteAjoute = Base<'ContexteAjoute', { cle: `perso:${string}`; libelle: string }>;
/** Une raison personnelle d'arrêter, rappelée pendant le SOS envie (F7.1). */
export type RaisonAjoutee = Base<'RaisonAjoutee', { texte: string }>;
export type EnvieResistee = Base<'EnvieResistee', { strategieUtilisee?: string }>;
export type SaisieAnnulee = Base<'SaisieAnnulee', { evenementId: string }>;
/** Précise une cigarette après coup : contexte (RM-16) et/ou heure réelle. */
export type CigaretteCorrigee = Base<
  'CigaretteCorrigee',
  { evenementId: string; contexte?: ContexteCigarette; occurredAt?: string }
>;

export type PatchPose = Base<'PatchPose', { dosageMg: number; dureePortHeures: 16 | 24; site?: string }>;
export type PatchRetire = Base<'PatchRetire', Record<string, never>>;
export type SubstitutOralPris = Base<'SubstitutOralPris', { forme: TypeSubstitutOral; dosageMg: number }>;

export type PrixModifie = Base<
  'PrixModifie',
  { prixPaquetCents: number; cigarettesParPaquet: number; aPartirDu: LocalDate }
>;
export type ObjectifEpargneDefini = Base<'ObjectifEpargneDefini', { libelle: string; montantCents: number }>;
export type ConsentementModifie = Base<
  'ConsentementModifie',
  { finalite: 'donnees-sante' | 'notifications' | 'coach-ia' | 'montre' | 'statistiques'; accorde: boolean }
>;

export type DomainEvent =
  | ProfilCree
  | PlanDemarre
  | RythmeModifie
  | PalierDemande
  | CigaretteFumee
  | EnvieResistee
  | SaisieAnnulee
  | CigaretteCorrigee
  | ContexteAjoute
  | RaisonAjoutee
  | PatchPose
  | PatchRetire
  | SubstitutOralPris
  | PrixModifie
  | ObjectifEpargneDefini
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
      break;
    case 'SubstitutOralPris':
    case 'PatchPose':
      if (!(e.payload.dosageMg > 0)) errors.push('dosageMg invalide');
      break;
    default:
      break;
  }
  return errors;
}

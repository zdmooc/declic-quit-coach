/**
 * Ports (interfaces) : le domaine et les cas d'usage ne dépendent que de ces contrats (ADR-0002).
 */

import type { Candidate, DomainEvent } from '../domain';

export interface EventStore {
  append(event: DomainEvent): Promise<void>;
  all(): Promise<DomainEvent[]>;
  /** Suppression totale des données (F9.2). */
  effacer(): Promise<void>;
}

export interface Clock {
  now(): number;
  /** Fuseau IANA courant de l'appareil. */
  timeZone(): string;
}

export interface IdGenerator {
  next(): string;
}

export interface Notifier {
  /** Remplace toutes les notifications programmées par cette liste. */
  remplacer(planifiees: readonly Candidate[]): Promise<void>;
}

export interface TourCoach {
  role: 'user' | 'assistant';
  texte: string;
}

/** Coach IA distant (ADR-0005) : reçoit un résumé non identifiant, jamais le journal. */
export interface CoachIa {
  repondre(requete: { mode: 'sos' | 'soir' | 'fauxpas'; resume: Record<string, string | number | null>; tours: TourCoach[] }): Promise<string>;
}

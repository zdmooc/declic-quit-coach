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

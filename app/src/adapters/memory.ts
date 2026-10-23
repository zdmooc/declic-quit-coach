/**
 * Adapters en mémoire : tests et premier prototype.
 * Le stockage SQLite chiffré remplacera `InMemoryEventStore` (voir docs/architecture/03).
 */

import type { Candidate, DomainEvent } from '../domain';
import type { Clock, EventStore, IdGenerator, Notifier } from '../ports';

export class InMemoryEventStore implements EventStore {
  private readonly events: DomainEvent[] = [];
  private readonly ids = new Set<string>();

  async append(event: DomainEvent): Promise<void> {
    // Idempotent : un événement déjà reçu (par exemple depuis la montre) est ignoré.
    if (this.ids.has(event.id)) return;
    this.ids.add(event.id);
    this.events.push(event);
  }

  async all(): Promise<DomainEvent[]> {
    return [...this.events];
  }

  async effacer(): Promise<void> {
    this.events.length = 0;
    this.ids.clear();
  }
}

export class FakeClock implements Clock {
  constructor(
    private instant: number,
    private readonly tz = 'Europe/Paris',
  ) {}
  now(): number {
    return this.instant;
  }
  timeZone(): string {
    return this.tz;
  }
  avancerMinutes(minutes: number): void {
    this.instant += minutes * 60_000;
  }
}

export class SystemClock implements Clock {
  now(): number {
    return Date.now();
  }
  timeZone(): string {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'Europe/Paris';
  }
}

/** UUID v7 : 48 bits d'horodatage + aléa, ordonnable dans le temps. */
export class UuidV7Generator implements IdGenerator {
  constructor(
    private readonly random: (bytes: Uint8Array) => void,
    private readonly clock: () => number = Date.now,
  ) {}

  next(): string {
    const b = new Uint8Array(16);
    this.random(b);
    const ts = this.clock();
    b[0] = Math.floor(ts / 2 ** 40) & 0xff;
    b[1] = Math.floor(ts / 2 ** 32) & 0xff;
    b[2] = Math.floor(ts / 2 ** 24) & 0xff;
    b[3] = Math.floor(ts / 2 ** 16) & 0xff;
    b[4] = Math.floor(ts / 2 ** 8) & 0xff;
    b[5] = ts & 0xff;
    b[6] = (b[6]! & 0x0f) | 0x70;
    b[8] = (b[8]! & 0x3f) | 0x80;
    const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
}

export class MemoryNotifier implements Notifier {
  planifiees: readonly Candidate[] = [];
  async remplacer(planifiees: readonly Candidate[]): Promise<void> {
    this.planifiees = planifiees;
  }
}

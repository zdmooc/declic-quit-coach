/**
 * Journal d'événements persistant sur le téléphone (ADR-0003), via expo-sqlite.
 *
 * Limite actuelle : dans Expo Go, SQLCipher n'est pas disponible, la base n'est donc PAS chiffrée.
 * Le chiffrement (ADR-0003, docs/architecture/04 § 3.1) arrivera avec le premier build de développement.
 */

import type { DomainEvent } from '../domain';
import type { EventStore } from '../ports';

/** Sous-ensemble de l'API expo-sqlite utilisé (facilite les tests). */
export interface BaseSqlite {
  execAsync(source: string): Promise<void>;
  runAsync(source: string, ...params: (string | number | null)[]): Promise<unknown>;
  getAllAsync<T>(source: string, ...params: (string | number | null)[]): Promise<T[]>;
}

interface Ligne {
  id: string;
  type: string;
  schema_version: number;
  occurred_at: string;
  tz: string;
  source: string;
  payload: string;
}

export const SCHEMA = `
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS events (
    rang INTEGER PRIMARY KEY AUTOINCREMENT,
    id TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL,
    schema_version INTEGER NOT NULL,
    occurred_at TEXT NOT NULL,
    tz TEXT NOT NULL,
    source TEXT NOT NULL,
    payload TEXT NOT NULL,
    recorded_at TEXT NOT NULL
  );
`;

export class SqliteEventStore implements EventStore {
  private constructor(private readonly db: BaseSqlite) {}

  /** Ouvre (ou crée) la base et son schéma. */
  static async ouvrir(db: BaseSqlite): Promise<SqliteEventStore> {
    await db.execAsync(SCHEMA);
    return new SqliteEventStore(db);
  }

  async append(e: DomainEvent): Promise<void> {
    // INSERT OR IGNORE : un événement déjà reçu (même id, par exemple depuis la montre) est ignoré.
    await this.db.runAsync(
      'INSERT OR IGNORE INTO events (id, type, schema_version, occurred_at, tz, source, payload, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      e.id,
      e.type,
      e.schemaVersion,
      e.occurredAt,
      e.tz,
      e.source,
      JSON.stringify(e.payload),
      new Date().toISOString(),
    );
  }

  async all(): Promise<DomainEvent[]> {
    // L'ordre d'ajout (rang) départage les événements de même instant (voir effectiveEvents).
    const lignes = await this.db.getAllAsync<Ligne>(
      'SELECT id, type, schema_version, occurred_at, tz, source, payload FROM events ORDER BY rang',
    );
    return lignes.map(
      (l) =>
        ({
          id: l.id,
          type: l.type,
          schemaVersion: l.schema_version,
          occurredAt: l.occurred_at,
          tz: l.tz,
          source: l.source,
          payload: JSON.parse(l.payload) as unknown,
        }) as DomainEvent,
    );
  }

  /** Suppression totale des données (F9.2). */
  async effacer(): Promise<void> {
    await this.db.execAsync('DELETE FROM events;');
  }
}

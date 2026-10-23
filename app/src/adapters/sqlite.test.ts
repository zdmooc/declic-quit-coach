import { describe, expect, it } from 'vitest';
import type { DomainEvent } from '../domain';
import { SqliteEventStore, type BaseSqlite } from './sqlite';

/** Fausse base : imite les trois appels utilisés (INSERT OR IGNORE, SELECT ordonné, DELETE). */
function fausseBase(): BaseSqlite & { schema: string[] } {
  const lignes: Record<string, string | number>[] = [];
  const schema: string[] = [];
  return {
    schema,
    async execAsync(sql) {
      if (sql.startsWith('DELETE')) lignes.length = 0;
      else schema.push(sql);
    },
    async runAsync(_sql, id, type, schema_version, occurred_at, tz, source, payload) {
      if (lignes.some((l) => l.id === id)) return;
      lignes.push({ id: id!, type: type!, schema_version: schema_version!, occurred_at: occurred_at!, tz: tz!, source: source!, payload: payload! });
    },
    async getAllAsync<T>() {
      return [...lignes] as T[];
    },
  };
}

const ev = (id: string, a: string): DomainEvent => ({
  id,
  type: 'CigaretteFumee',
  schemaVersion: 1,
  occurredAt: a,
  tz: 'Europe/Paris',
  source: 'phone',
  payload: { contexte: 'cafe' },
});

describe('SqliteEventStore', () => {
  it('crée le schéma, ajoute, relit dans l\'ordre d\'ajout, ignore les doublons, efface', async () => {
    const db = fausseBase();
    const store = await SqliteEventStore.ouvrir(db);
    expect(db.schema[0]).toContain('CREATE TABLE IF NOT EXISTS events');
    await store.append(ev('b', '2026-11-02T10:00:00.000Z'));
    await store.append(ev('a', '2026-11-02T09:00:00.000Z'));
    await store.append(ev('b', '2026-11-02T10:00:00.000Z'));
    expect(await store.all()).toEqual([ev('b', '2026-11-02T10:00:00.000Z'), ev('a', '2026-11-02T09:00:00.000Z')]);
    await store.effacer();
    expect(await store.all()).toEqual([]);
  });
});

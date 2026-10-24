/**
 * Réglages techniques propres à ce téléphone (adresse et code du coach IA).
 * Hors journal d'événements : jamais exportés, effacés avec les données.
 */

import type { BaseSqlite } from './sqlite';

export interface ConfigCoach {
  url: string;
  jeton: string;
}

export class ReglagesLocaux {
  private constructor(private readonly db: BaseSqlite) {}

  static async ouvrir(db: BaseSqlite): Promise<ReglagesLocaux> {
    await db.execAsync('CREATE TABLE IF NOT EXISTS reglages_locaux (cle TEXT PRIMARY KEY, valeur TEXT NOT NULL);');
    return new ReglagesLocaux(db);
  }

  async lire(cle: string): Promise<string | null> {
    const lignes = await this.db.getAllAsync<{ valeur: string }>('SELECT valeur FROM reglages_locaux WHERE cle = ?', cle);
    return lignes[0]?.valeur ?? null;
  }

  async ecrire(cle: string, valeur: string | null): Promise<void> {
    if (valeur === null) await this.db.runAsync('DELETE FROM reglages_locaux WHERE cle = ?', cle);
    else await this.db.runAsync('INSERT OR REPLACE INTO reglages_locaux (cle, valeur) VALUES (?, ?)', cle, valeur);
  }

  async configCoach(): Promise<ConfigCoach | null> {
    const brut = await this.lire('coach');
    if (!brut) return null;
    try {
      const c = JSON.parse(brut) as Partial<ConfigCoach>;
      return c.url && c.jeton ? { url: c.url, jeton: c.jeton } : null;
    } catch {
      return null;
    }
  }

  definirConfigCoach(c: ConfigCoach | null): Promise<void> {
    return this.ecrire('coach', c ? JSON.stringify(c) : null);
  }

  effacer(): Promise<void> {
    return this.db.execAsync('DELETE FROM reglages_locaux;');
  }
}

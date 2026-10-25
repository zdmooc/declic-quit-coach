/**
 * Client du relais du coach IA (dossier `coach-relay/`, Cloudflare Worker).
 * La clé de l'API IA reste sur le relais ; le téléphone n'envoie que le résumé non identifiant.
 */

import type { CoachIa, TourCoach } from '../ports';

/**
 * Nettoie l'adresse saisie : espaces, barres finales, et point final ajouté par le clavier
 * (« …workers.dev. » casse la vérification du certificat TLS).
 */
export function normaliserUrlCoach(saisie: string): string {
  return saisie.trim().replace(/[\s/.]+$/, '').replace(/^http:\/\//i, 'https://');
}

export class CoachHttp implements CoachIa {
  constructor(
    private readonly url: string,
    private readonly jeton: string,
    private readonly delaiMs = 25_000,
  ) {}

  async repondre(requete: { mode: 'sos' | 'soir' | 'fauxpas'; resume: Record<string, string | number | null>; tours: TourCoach[] }): Promise<string> {
    const abandon = new AbortController();
    const minuteur = setTimeout(() => abandon.abort(), this.delaiMs);
    try {
      const r = await fetch(`${normaliserUrlCoach(this.url)}/coach`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.jeton}` },
        body: JSON.stringify(requete),
        signal: abandon.signal,
      });
      if (r.status === 401) throw new Error('Code d’accès refusé par le relais');
      if (r.status === 429) throw new Error('Le coach a beaucoup parlé aujourd’hui : réessaie plus tard');
      if (!r.ok) throw new Error(`Le relais a répondu ${r.status}`);
      const json = (await r.json()) as { texte?: unknown };
      if (typeof json.texte !== 'string' || json.texte.trim() === '') throw new Error('Réponse vide du coach');
      return json.texte.trim();
    } finally {
      clearTimeout(minuteur);
    }
  }
}

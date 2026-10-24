import { describe, expect, it } from 'vitest';
import { garde, traiter, valider, type Env } from './index';

const ENV: Env = { ANTHROPIC_API_KEY: 'cle-test', APP_TOKEN: 'code-secret-123' };

const requete = (corps: unknown, jeton = 'code-secret-123', chemin = '/coach') =>
  new Request(`https://relais.test${chemin}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(corps),
  });

const CORPS = { mode: 'sos', resume: { phase: 'reduction', quotaDuJour: 9 }, tours: [{ role: 'user', texte: 'J’ai très envie' }] };

describe('relais du coach', () => {
  it('refuse sans le bon code d’accès', async () => {
    expect((await traiter(requete(CORPS, 'mauvais'), ENV)).status).toBe(401);
  });

  it('garde-fous : réponse fixe sans appeler l’IA', async () => {
    let appels = 0;
    const r = await traiter(requete({ ...CORPS, tours: [{ role: 'user', texte: 'Quelle dose de pastilles ?' }] }), ENV, async () => {
      appels++;
      return new Response('{}');
    });
    expect(await r.json()).toMatchObject({ garde: true });
    expect(appels).toBe(0);
    expect(garde('j’ai envie d’en finir')).toContain('3114');
  });

  it('appelle l’API avec les consignes et le résumé, renvoie le texte', async () => {
    let envoye: { model: string; system: string; messages: unknown[] } | null = null;
    const r = await traiter(requete(CORPS), ENV, async (_url, init) => {
      envoye = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ content: [{ type: 'text', text: 'Respire avec moi.' }] }));
    });
    expect(await r.json()).toEqual({ texte: 'Respire avec moi.', garde: false });
    expect(envoye!.model).toBe('claude-haiku-5-5');
    expect(envoye!.system).toContain('JAMAIS de conseil de dosage');
    expect(envoye!.system).toContain('"quotaDuJour":9');
    expect(envoye!.messages).toEqual([{ role: 'user', content: 'J’ai très envie' }]);
  });

  it('valide et tronque la requête', () => {
    expect(valider({ mode: 'autre', tours: [] })).toBeNull();
    const v = valider({ mode: 'soir', resume: { a: 'x'.repeat(100) }, tours: [{ role: 'assistant', texte: 'Bonjour' }, { role: 'user', texte: 'y'.repeat(900) }] })!;
    expect(v.tours).toHaveLength(1);
    expect(v.tours[0]!.texte).toHaveLength(500);
    expect(String(v.resume.a)).toHaveLength(40);
  });
});

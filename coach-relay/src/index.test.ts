import { describe, expect, it } from 'vitest';
import { garde, traiter, valider, MODELE_PAR_DEFAUT, type Env, type IaWorkers } from './index';

function env(ia: IaWorkers['run']): Env {
  return { AI: { run: ia }, APP_TOKEN: 'code-secret-123' };
}

const requete = (corps: unknown, jeton = 'code-secret-123', chemin = '/coach') =>
  new Request(`https://relais.test${chemin}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(corps),
  });

const CORPS = { mode: 'sos', resume: { phase: 'reduction', quotaDuJour: 9 }, tours: [{ role: 'user', texte: 'J’ai très envie' }] };

describe('relais du coach', () => {
  it('refuse sans le bon code d’accès', async () => {
    expect((await traiter(requete(CORPS, 'mauvais'), env(async () => ({ response: 'x' })))).status).toBe(401);
  });

  it('garde-fous : réponse fixe sans appeler l’IA', async () => {
    let appels = 0;
    const r = await traiter(
      requete({ ...CORPS, tours: [{ role: 'user', texte: 'Quelle dose de pastilles ?' }] }),
      env(async () => {
        appels++;
        return { response: 'x' };
      }),
    );
    expect(await r.json()).toMatchObject({ garde: true });
    expect(appels).toBe(0);
    expect(garde('j’ai envie d’en finir')).toContain('3114');
  });

  it('appelle le modèle open source avec les consignes et le résumé, renvoie le texte', async () => {
    let appel: { modele: string; messages: { role: string; content: string }[] } | null = null;
    const r = await traiter(
      requete(CORPS),
      env(async (modele, entree) => {
        appel = { modele, messages: entree.messages };
        return { response: ' Respire avec moi. ' };
      }),
    );
    expect(await r.json()).toEqual({ texte: 'Respire avec moi.', garde: false });
    expect(appel!.modele).toBe(MODELE_PAR_DEFAUT);
    expect(appel!.messages[0]!.role).toBe('system');
    expect(appel!.messages[0]!.content).toContain('JAMAIS de conseil de dosage');
    expect(appel!.messages[0]!.content).toContain('"quotaDuJour":9');
    expect(appel!.messages.slice(1)).toEqual([{ role: 'user', content: 'J’ai très envie' }]);
  });

  it('format « choices » accepté ; quota gratuit épuisé → 429', async () => {
    const ok = await traiter(requete(CORPS), env(async () => ({ choices: [{ message: { content: 'Bravo.' } }] })));
    expect(await ok.json()).toEqual({ texte: 'Bravo.', garde: false });
    const quota = await traiter(
      requete(CORPS),
      env(async () => {
        throw new Error('4006: you have used up your daily free allocation of 10,000 neurons');
      }),
    );
    expect(quota.status).toBe(429);
  });

  it('valide et tronque la requête', () => {
    expect(valider({ mode: 'autre', tours: [] })).toBeNull();
    const v = valider({ mode: 'soir', resume: { a: 'x'.repeat(100) }, tours: [{ role: 'assistant', texte: 'Bonjour' }, { role: 'user', texte: 'y'.repeat(900) }] })!;
    expect(v.tours).toHaveLength(1);
    expect(v.tours[0]!.texte).toHaveLength(500);
    expect(String(v.resume.a)).toHaveLength(40);
  });
});

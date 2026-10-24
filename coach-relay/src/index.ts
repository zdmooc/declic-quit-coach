/**
 * Relais du coach IA de Déclic (ADR-0005).
 *
 * - garde la clé de l'API IA côté serveur (jamais dans l'application) ;
 * - vérifie le code d'accès de l'application ;
 * - applique les garde-fous AVANT l'appel (détresse, symptômes, dosage) : réponse fixe ;
 * - ne journalise ni ne stocke rien : aucun message n'est conservé par le relais.
 */

export interface Env {
  ANTHROPIC_API_KEY: string;
  APP_TOKEN: string;
  MODEL?: string;
  MAX_TOKENS?: string;
}

type Mode = 'sos' | 'soir' | 'fauxpas';
interface Tour {
  role: 'user' | 'assistant';
  texte: string;
}
interface Requete {
  mode: Mode;
  resume: Record<string, string | number | null>;
  tours: Tour[];
}

const MAX_TOURS = 12;
const MAX_CARACTERES = 500;

const CONSIGNES = `Tu es le coach de Déclic, une application française qui aide un fumeur à réduire puis arrêter la cigarette, une cigarette de moins par jour.

Ton rôle : motiver, aider à passer une envie, analyser avec bienveillance, proposer une parade concrète.
Style : français, tutoiement, chaleureux et direct. 2 à 5 phrases courtes. Pas de listes à puces sauf pour 2 ou 3 parades. Pas d'emoji.

Règles absolues :
1. Tu ne donnes JAMAIS de conseil de dosage, de nombre de patchs, pastilles ou gommes, ni de médicament. Tu renvoies vers le médecin, le pharmacien ou Tabac Info Service (39 89).
2. Tu ne poses aucun diagnostic. Symptôme physique inquiétant : 15 ou 112. Détresse, idées noires : 3114 (prévention du suicide) ou 15.
3. Jamais culpabilisant : on dit « faux pas », jamais « échec » ou « rechute ». Le plan ne recule pas et les économies restent acquises.
4. Tu es une IA : si on te le demande, tu le dis. Tu ne prétends pas être humain ni professionnel de santé.
5. Tu t'appuies sur le résumé chiffré fourni (quota, cigarettes du jour, déclencheur principal, heure à risque, économies). Tu n'inventes pas de chiffres.
6. Pas de publicité, pas de marque de cigarette, pas de cigarette électronique recommandée comme solution.

Parades possibles : respiration 5 secondes / 5 secondes pendant 3 minutes (bouton SOS de l'app), boire un grand verre d'eau, marcher 5 minutes, occuper ses mains, se brosser les dents, changer de pièce, attendre 10 minutes (une envie dure rarement plus de quelques minutes), relire ses raisons d'arrêter.`;

const CONSIGNES_MODE: Record<Mode, string> = {
  sos: "Situation : l'utilisateur a une envie MAINTENANT. Aide-le à la traverser : accueille, une parade immédiate, encourage. Très court.",
  soir: "Situation : bilan de la journée. Valorise ce qui a marché, propose UN ajustement simple pour demain en t'appuyant sur le déclencheur ou l'heure à risque.",
  fauxpas:
    "Situation : l'utilisateur a fumé après l'arrêt. Dédramatise, rappelle ce qui reste acquis, cherche avec lui le déclencheur et prépare une parade pour la prochaine fois.",
};

const DETRESSE = ['suicid', 'me tuer', 'envie de mourir', 'veux mourir', 'en finir', 'plus envie de vivre', 'me faire du mal', 'automutil', 'scarif'];
const SYMPTOMES = ['douleur poitrine', 'douleur thoracique', 'mal à la poitrine', 'mal a la poitrine', 'palpitation', 'malaise', 'évanoui', 'evanoui', 'du mal à respirer', 'du mal a respirer', 'convulsion'];
const DOSAGE = ['dose', 'dosage', 'combien de patch', 'combien de pastille', 'combien de gomme', 'milligramme', 'deux patch'];

export function garde(texte: string): string | null {
  const t = ` ${texte.toLocaleLowerCase('fr-FR')} `;
  if (DETRESSE.some((m) => t.includes(m)))
    return 'Ce que tu ressens compte, et tu n’as pas à rester seul avec ça. Appelle le 3114 (prévention du suicide, 24 h/24, gratuit) ou le 15. En cas de danger immédiat, le 112.';
  if (SYMPTOMES.some((m) => t.includes(m)))
    return 'Je ne peux pas évaluer un symptôme. Si c’est intense ou inhabituel, appelle le 15 (ou le 112). Sinon, parles-en rapidement à ton médecin ou à ton pharmacien.';
  if (DOSAGE.some((m) => t.includes(m)))
    return 'Je ne donne pas de conseil de dosage : c’est le rôle de ton médecin, de ton pharmacien ou d’un tabacologue. Tabac Info Service (39 89) peut t’orienter gratuitement.';
  return null;
}

/** Valide et nettoie la requête de l'application. */
export function valider(corps: unknown): Requete | null {
  if (typeof corps !== 'object' || corps === null) return null;
  const c = corps as Partial<Requete>;
  if (c.mode !== 'sos' && c.mode !== 'soir' && c.mode !== 'fauxpas') return null;
  if (!Array.isArray(c.tours) || c.tours.length === 0) return null;
  const tours = c.tours
    .slice(-MAX_TOURS)
    .filter((t): t is Tour => typeof t === 'object' && t !== null && (t.role === 'user' || t.role === 'assistant') && typeof t.texte === 'string')
    .map((t) => ({ role: t.role, texte: t.texte.slice(0, MAX_CARACTERES) }));
  // L'API exige un premier message de l'utilisateur.
  while (tours.length > 0 && tours[0]!.role !== 'user') tours.shift();
  if (tours.length === 0 || tours[tours.length - 1]!.role !== 'user') return null;
  const resume: Record<string, string | number | null> = {};
  for (const [k, v] of Object.entries(c.resume ?? {}).slice(0, 30)) {
    if (typeof v === 'number' || v === null) resume[k.slice(0, 40)] = v;
    else if (typeof v === 'string') resume[k.slice(0, 40)] = v.slice(0, 40);
  }
  return { mode: c.mode, resume, tours };
}

const json = (corps: unknown, status = 200) =>
  new Response(JSON.stringify(corps), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });

/** Comparaison en temps constant du code d'accès. */
function memeJeton(a: string, b: string): boolean {
  if (a.length !== b.length || a.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function traiter(requete: Request, env: Env, appeler: typeof fetch = fetch): Promise<Response> {
  const url = new URL(requete.url);
  if (url.pathname === '/sante') return json({ ok: true });
  if (url.pathname !== '/coach' || requete.method !== 'POST') return json({ erreur: 'introuvable' }, 404);

  const jeton = (requete.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!env.APP_TOKEN || !memeJeton(jeton, env.APP_TOKEN)) return json({ erreur: 'non autorisé' }, 401);

  let corps: unknown;
  try {
    corps = await requete.json();
  } catch {
    return json({ erreur: 'corps invalide' }, 400);
  }
  const r = valider(corps);
  if (!r) return json({ erreur: 'requête invalide' }, 400);

  const dernier = r.tours[r.tours.length - 1]!.texte;
  const g = garde(dernier);
  if (g) return json({ texte: g, garde: true });

  const reponse = await appeler('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: env.MODEL ?? 'claude-haiku-5-5',
      max_tokens: Number(env.MAX_TOKENS ?? 450),
      system: `${CONSIGNES}\n\n${CONSIGNES_MODE[r.mode]}\n\nRésumé de la situation (chiffres non identifiants) :\n${JSON.stringify(r.resume)}`,
      messages: r.tours.map((t) => ({ role: t.role, content: t.texte })),
    }),
  });
  if (reponse.status === 429) return json({ erreur: 'trop de demandes' }, 429);
  if (!reponse.ok) return json({ erreur: `fournisseur IA : ${reponse.status}` }, 502);
  const donnees = (await reponse.json()) as { content?: { type: string; text?: string }[] };
  const texte = (donnees.content ?? [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text ?? '')
    .join('')
    .trim();
  if (!texte) return json({ erreur: 'réponse vide' }, 502);
  return json({ texte, garde: false });
}

export default {
  fetch: (requete: Request, env: Env) => traiter(requete, env),
};

# Relais du coach IA de Déclic

Petit serveur (Cloudflare Worker) entre l'application et l'IA. **Gratuit et open source** :
le modèle est **Mistral Small 3.1** (licence Apache 2.0, très bon en français), exécuté par
Cloudflare Workers AI dans son offre gratuite (10 000 « neurons » par jour, remis à zéro à
minuit UTC). Aucune clé d'API, aucune carte bancaire.

Le relais vérifie le code d'accès de l'app, applique les garde-fous (détresse, symptômes, dosage)
et ne conserve aucun message. Voir [ADR-0009](../docs/architecture/adr/0009-relais-coach-cloudflare-prototype.md).

## Installer (Windows, PowerShell) — environ 5 minutes

### 1. Compte Cloudflare
Crée un compte gratuit sur https://dash.cloudflare.com/sign-up (pas de carte demandée).

### 2. Déployer le relais
```powershell
cd C:\workspaces\declic-quit-coach\coach-relay
git pull
npm.cmd install
npx.cmd wrangler login            # ouvre le navigateur : autorise Wrangler
npx.cmd wrangler deploy           # affiche l'adresse https://declic-coach.<toi>.workers.dev
npx.cmd wrangler secret put APP_TOKEN   # invente un code d'accès long (au moins 20 caractères)
```
Au premier `deploy`, Wrangler peut te demander de choisir un sous-domaine `workers.dev` : accepte.

Vérification : ouvre `https://declic-coach.<toi>.workers.dev/sante` dans le navigateur → `{"ok":true}`.

### 3. Brancher l'application
Déclic → **Réglages** → carte **Coach IA** :
1. « J'accepte l'envoi de ce résumé » ;
2. adresse du relais et code d'accès, puis **Enregistrer** ;
3. **Tester le coach**.

Le coach apparaît ensuite dans le **SOS envie** (« Parler au coach ») et dans **Progrès** (« En parler avec le coach »).

## Coût
Zéro. Si le quota gratuit du jour est épuisé, le coach répond « réessaie plus tard » et le
coach écrit (bilan du soir, faux pas, SOS respiration) continue de fonctionner hors ligne.
Pour changer de modèle : variable `MODEL` dans `wrangler.toml` (par exemple `@cf/google/gemma-3-12b-it`,
plus léger), puis `npx.cmd wrangler deploy`.

## Ce que le relais reçoit
- le mode (`sos`, `soir`, `fauxpas`) ;
- un résumé chiffré : phase, quota, cigarettes du jour, intervalles, déclencheur principal, heure à risque, économies arrondies ;
- les 12 derniers messages de la conversation (500 caractères maximum chacun).

Jamais : l'historique détaillé, les heures exactes, les raisons d'arrêter, les substituts.

## Développement
```bash
npm install
npm test          # garde-fous et validation
npm run typecheck
npx wrangler dev  # local (l'IA tourne chez Cloudflare), avec un fichier .dev.vars : APP_TOKEN=…
```

## Avant une publication
Ce relais est fait pour un usage personnel : un seul code d'accès partagé, pas de limite par appareil,
pas de garantie d'hébergement en UE. Pour publier : BFF UE (ADR-0005), authentification anonyme par appareil, limite de débit, DPA et AIPD.

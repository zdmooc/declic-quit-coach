# Relais du coach IA de Déclic

Petit serveur (Cloudflare Worker, gratuit) entre l'application et l'IA (Claude Haiku 5.5).
Il garde la clé de l'API secrète, vérifie le code d'accès de l'app, applique les garde-fous
(détresse, symptômes, dosage) et ne conserve aucun message. Voir [ADR-0009](../docs/architecture/adr/0009-relais-coach-cloudflare-prototype.md).

## Installer (Windows, PowerShell) — environ 10 minutes

### 1. Clé de l'API Anthropic
1. Crée un compte sur https://console.anthropic.com et ajoute un peu de crédit prépayé.
2. **Fixe une limite de dépense mensuelle basse** (par exemple 5 $) dans les réglages de facturation : c'est le plafond de sécurité.
3. Crée une clé d'API et copie-la (elle commence par `sk-ant-`).

### 2. Compte Cloudflare
Crée un compte gratuit sur https://dash.cloudflare.com/sign-up.

### 3. Déployer le relais
```powershell
cd C:\workspaces\declic-quit-coach\coach-relay
git pull
npm.cmd install
npx.cmd wrangler login                      # ouvre le navigateur : autorise Wrangler
npx.cmd wrangler deploy                     # affiche l'adresse https://declic-coach.<toi>.workers.dev
npx.cmd wrangler secret put ANTHROPIC_API_KEY   # colle la clé sk-ant-…
npx.cmd wrangler secret put APP_TOKEN           # invente un code d'accès long (au moins 20 caractères)
```
Vérification : ouvre `https://declic-coach.<toi>.workers.dev/sante` dans le navigateur → `{"ok":true}`.

### 4. Brancher l'application
Déclic → **Réglages** → carte **Coach IA** :
1. « J'accepte l'envoi de ce résumé » ;
2. adresse du relais et code d'accès, puis **Enregistrer** ;
3. **Tester le coach**.

Le coach apparaît ensuite dans le **SOS envie** (« Parler au coach ») et dans **Progrès** (« En parler avec le coach »).

## Coût
Haiku 5.5 : 0,10 $ / 0,50 $ par million de tokens (entrée / sortie). Un échange ≈ 0,0003 $ ;
20 échanges par jour ≈ 0,20 $ par mois. Cloudflare : gratuit.

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
npx wrangler dev  # local, avec un fichier .dev.vars (ANTHROPIC_API_KEY=…, APP_TOKEN=…)
```

## Avant une publication
Ce relais est fait pour un usage personnel : un seul code d'accès partagé, pas de limite par appareil,
pas de garantie d'hébergement en UE. Pour publier : BFF UE (ADR-0005), authentification anonyme par appareil, limite de débit, DPA et AIPD.

# ADR-0009 — Relais du coach IA sur Cloudflare Workers (prototype personnel)

- **Statut** : accepté (prototype, usage personnel) · révise ADR-0005 pour cette phase
- **Date** : 2026-10-24

## Contexte

ADR-0005 prévoit un BFF sur Scaleway (Paris) pour la publication. Pour l'usage personnel du porteur du projet, il faut un relais gratuit, déployable en quelques minutes depuis un poste Windows, sans compte cloud payant.

## Décision

- Le relais (`coach-relay/`) est un **Cloudflare Worker** sans état : il garde la clé de l'API IA, vérifie un **code d'accès** (secret partagé saisi dans les réglages du téléphone, jamais dans le dépôt), applique les garde-fous en entrée et appelle **Claude Haiku 5.5**.
- Il ne journalise ni ne stocke aucun message (observabilité désactivée).
- Le téléphone n'envoie que le **résumé chiffré** (`resumeCoach`) et les messages de la conversation ; le consentement est un événement du journal (`ConsentementModifie`, finalité `coach-ia`).
- Garde-fous en double : côté app (domaine `coach.ts`, avant tout envoi) et côté relais.
- Le budget est plafonné par la **limite de dépense** du compte Anthropic.

## Conséquences

- Coût : Haiku 5.5 à 0,10 $ / 0,50 $ par million de tokens (entrée / sortie) ; un échange ≈ 1 500 tokens en entrée et 300 en sortie, soit ≈ 0,0003 $. Usage personnel intensif (20 échanges par jour) : ≈ 0,20 $ par mois. Cloudflare : offre gratuite.
- Le code d'accès est un secret unique : suffisant pour un usage personnel, **insuffisant pour une publication** (pas d'authentification par utilisateur, pas de limite de débit par appareil).
- Cloudflare traite les requêtes au plus près de l'utilisateur sans garantie de localisation UE sur l'offre gratuite ; le fournisseur IA est hors UE. **Avant publication** : revenir au BFF UE d'ADR-0005 (ou équivalent), authentification anonyme par appareil, limite de débit, DPA et AIPD.

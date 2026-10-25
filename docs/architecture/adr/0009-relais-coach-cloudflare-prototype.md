# ADR-0009 — Relais du coach IA sur Cloudflare Workers (prototype personnel)

- **Statut** : accepté (prototype, usage personnel) · révise ADR-0005 pour cette phase
- **Date** : 2026-10-24

## Contexte

ADR-0005 prévoit un BFF sur Scaleway (Paris) pour la publication. Pour l'usage personnel du porteur du projet, il faut un relais gratuit, déployable en quelques minutes depuis un poste Windows, sans compte cloud payant.

## Décision

- Le relais (`coach-relay/`) est un **Cloudflare Worker** sans état : il vérifie un **code d'accès** (secret partagé saisi dans les réglages du téléphone, jamais dans le dépôt), applique les garde-fous en entrée et appelle un **modèle open source** via **Cloudflare Workers AI** : Mistral Small 3.1 (Apache 2.0), choisi pour sa qualité en français. Révision du 2026-10-25 : le porteur du projet ne veut aucune dépense pour le moment ; Claude Haiku 5.5 (payant) est écarté pour cette phase.
- Il ne journalise ni ne stocke aucun message (observabilité désactivée).
- Le téléphone n'envoie que le **résumé chiffré** (`resumeCoach`) et les messages de la conversation ; le consentement est un événement du journal (`ConsentementModifie`, finalité `coach-ia`).
- Garde-fous en double : côté app (domaine `coach.ts`, avant tout envoi) et côté relais.
- Le coût est nul : offre gratuite Workers AI (10 000 neurons par jour). Quota épuisé : réponse 429, l'app bascule sur le coach écrit hors ligne.

## Conséquences

- Coût : 0 €. Un modèle open source de 24 milliards de paramètres est moins fin qu'un modèle commercial récent : les garde-fous restent appliqués par le code (app et relais), jamais délégués au modèle.
- Le code d'accès est un secret unique : suffisant pour un usage personnel, **insuffisant pour une publication** (pas d'authentification par utilisateur, pas de limite de débit par appareil).
- Cloudflare traite les requêtes au plus près de l'utilisateur sans garantie de localisation UE sur l'offre gratuite ; l'inférence a lieu chez Cloudflare, sans engagement de localisation. **Avant publication** : revenir au BFF UE d'ADR-0005 (ou équivalent), authentification anonyme par appareil, limite de débit, DPA et AIPD.

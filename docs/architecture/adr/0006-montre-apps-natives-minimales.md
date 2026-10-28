# ADR-0006 — Montre : notifications d'abord, puis apps natives minimales

- **Statut** : accepté — **en attente** : la montre de l’utilisateur (Amazfit, Zepp OS) est aujourd’hui lue via Health Connect ([ADR-0011](0011-health-connect.md)) ; une mini-app Zepp OS remplacerait les apps watchOS / Wear OS.
- **Date** : 2026-10-23

## Contexte

Le geste « j'ai fumé » et le compte à rebours sont idéaux au poignet. React Native ne produit pas d'interface watchOS ni Wear OS.

## Décision

- **MVP** : notifications actionnables du téléphone, relayées automatiquement sur la montre.
- **V2** : une mini-app **SwiftUI** (watchOS) et une mini-app **Compose for Wear OS**, limitées à deux boutons, la respiration guidée et une complication.
- La montre **ne calcule rien** : elle émet des événements (UUID généré localement, file d'attente hors ligne) et affiche la `ProjectionMontre` envoyée par le téléphone.
- **V3** : lecture du stress via HealthKit / Health Connect, avec consentement explicite ; les valeurs brutes ne quittent jamais le téléphone.

## Conséquences

- Deux petites bases natives à maintenir, mais sans logique métier dupliquée.
- Un dossier `watch/` est réservé dans le dépôt dès maintenant.

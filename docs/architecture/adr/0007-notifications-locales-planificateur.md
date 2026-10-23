# ADR-0007 — Notifications locales pilotées par un planificateur du domaine

- **Statut** : accepté
- **Date** : 2026-10-23

## Contexte

Les notifications (économies, santé, plan, substituts) sont un levier de motivation fort, mais trop de notifications font désinstaller l'app. iOS limite le nombre de notifications locales en attente (64).

## Décision

- Notifications **locales** au MVP (aucun serveur), via `expo-notifications`.
- Un `NotificationPlanner` **pur** dans le domaine calcule la liste à partir des projections : plafond de 4 notifications non critiques par jour, heures calmes, priorités, regroupement des célébrations, réglages par catégorie.
- Seules les **24 à 48 prochaines heures** sont programmées ; replanification à chaque événement et à chaque ouverture.
- Notifications push serveur seulement en V3 (défis collectifs, buddy), via le BFF.

## Conséquences

- Règles anti-spam testables unitairement.
- Aucune dépendance réseau pour les rappels critiques (patch).

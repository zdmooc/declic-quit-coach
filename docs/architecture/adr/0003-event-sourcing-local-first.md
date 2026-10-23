# ADR-0003 — Event sourcing local-first

- **Statut** : accepté
- **Date** : 2026-10-23

## Contexte

Le cœur de l'app est une suite de faits horodatés (cigarettes, envies, substituts, prix). Les données sont des données de santé : les garder sur le téléphone évite l'hébergement HDS et réduit le risque RGPD. La montre doit pouvoir enregistrer hors connexion.

## Décision

La source de vérité est un **journal d'événements immuables** dans une base SQLite **chiffrée** sur le téléphone. Les écrans lisent des **projections** reconstruisibles. Les corrections passent par un événement `SaisieAnnulee`. Identifiants en UUID v7, horodatages en UTC avec le fuseau IANA.

## Conséquences

- Fonctionnement 100 % hors ligne, aucune base serveur.
- Un bug de calcul se corrige en reconstruisant les projections, sans toucher aux faits.
- Réception idempotente des événements de la montre.
- Pas de synchronisation multi-appareils au MVP ; si elle devient nécessaire, le journal s'y prête (ajout seul, sans conflit), mais elle imposera un hébergement HDS.
- La sauvegarde dépend de l'OS ou d'un export manuel (voir 06).

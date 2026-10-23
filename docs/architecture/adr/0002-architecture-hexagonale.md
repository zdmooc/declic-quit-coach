# ADR-0002 — Architecture hexagonale, domaine en TypeScript pur

- **Statut** : accepté
- **Date** : 2026-10-23

## Contexte

Les calculs (quota, intervalles, économies, limites des substituts) touchent à la santé et à la motivation : une erreur décrédibilise l'app. Les entrées sont multiples (écran, notification, montre) et les sorties évolueront (SQLite, coach IA, synchronisation éventuelle).

## Décision

Architecture **ports & adapters**. Le domaine ne dépend ni de React, ni de la base, ni de l'horloge système (`Clock` est un port). Les cas d'usage orchestrent ; les adapters implémentent les ports.

## Conséquences

- Domaine testable à 100 %, y compris les changements d'heure (horloge simulée).
- La montre et les notifications sont de simples adapters d'entrée.
- Un peu plus de code d'interfaces au démarrage.

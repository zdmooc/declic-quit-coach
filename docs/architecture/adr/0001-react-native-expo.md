# ADR-0001 — Application mobile en React Native avec Expo

- **Statut** : accepté
- **Date** : 2026-10-23

## Contexte

L'app doit sortir sur iOS et Android, avec des notifications locales actionnables, un stockage local chiffré, et à terme des apps montre et un BFF. Le porteur du projet travaille seul au démarrage.

## Décision

React Native avec **Expo**, en **TypeScript strict**. Builds et publication via EAS, mises à jour OTA via EAS Update. Les apps montre sont des cibles natives ajoutées par plugins de configuration (voir ADR-0006).

## Alternatives

- **Flutter** : très bonnes performances, mais langage Dart non partagé avec le BFF.
- **PWA** : la plus simple, mais notifications et intégrations montre trop limitées sur iOS.
- **Natif pur (Swift + Kotlin)** : deux bases de code complètes à maintenir.

## Conséquences

- Une base de code pour les deux téléphones, types partagés avec le BFF.
- Les apps montre restent en natif (Swift, Kotlin) : compétence à prévoir en V2.
- Dépendance à l'écosystème Expo et à ses tarifs (voir 07).

# Déclic — coach d'arrêt du tabac

> Une cigarette de moins chaque jour, un coach qui comprend tes moments.

**Déclic** est une application mobile (iOS, Android, montres connectées) qui accompagne un fumeur de *n* cigarettes par jour jusqu'à zéro, en retirant **une cigarette par jour** (rythme ajustable).

## Fonctionnalités prévues

- **Plan de réduction** : quota du jour, paliers en cas de difficulté, courbe jusqu'à zéro.
- **Comptage** de chaque cigarette en un tap, avec l'**intervalle** depuis la précédente et un compte à rebours vers la prochaine.
- **Substituts nicotiniques** : suivi des patchs, pastilles et gommes, rappels, limites de la notice.
- **Économies** et **bénéfices santé** en temps réel, objectifs d'épargne.
- **SOS envie** hors ligne, puis **coach IA** conversationnel (V2).
- **Notifications** motivantes et non intrusives (gains, santé, progression, rappels).
- **Montre connectée** : notifications actionnables, puis mini-app et complication (V2).
- **Confidentialité** : données stockées et chiffrées sur le téléphone, export et suppression en un geste.

## Statut

🟡 **Cadrage** — le dossier d'architecture est en cours ; le code n'est pas encore initialisé.

## Documentation

- [Dossier d'architecture](docs/architecture/README.md) : métier, fonctionnel, applicatif, technique, réseau, résilience, coûts
- [Décisions d'architecture (ADR)](docs/architecture/adr/README.md)

## Pile technique (cible)

React Native + Expo (TypeScript) · SQLite chiffré · expo-notifications · SwiftUI (watchOS) · Compose (Wear OS) · BFF serverless en UE · Claude Haiku 5.5 pour le coach.

## Avertissement

Déclic **ne remplace pas un avis médical**. L'application ne prescrit ni n'ajuste aucun traitement. Pour un accompagnement personnalisé : **Tabac Info Service, 39 89**, votre médecin ou votre pharmacien. En cas d'urgence : **15** ou **112**.

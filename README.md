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

🟡 **Prototype** — le moteur de calcul (domaine) est codé et testé ; l'application affiche un premier écran.

| Élément | État |
|---|---|
| Domaine : observation 3 jours, journées définies par les cigarettes, habitudes, déclencheurs, plan −1/jour, intervalles, économies, substituts, jalons, notifications | ✅ codé, 86 tests (dont tests par propriétés) |
| Cas d'usage (`Declic`) et ports | ✅ |
| Écrans : profil, page unique (compte à rebours, pastilles, actions), observation et bilan, « J'ai fumé » + contexte, palier | ✅ prototype |
| Stockage | ✅ SQLite sur le téléphone, les données survivent à la fermeture · ⚠️ **non chiffré** dans Expo Go (chiffrement avec le premier build de développement) |
| Notifications | ✅ locales sur le téléphone (expo-notifications), avec boutons « J'ai fumé » / « J'ai résisté » ; pendant l'observation, seul le « bilan prêt » est notifié |
| SOS envie | ✅ respiration guidée 3 min, raisons d'arrêter, envie résistée |
| Historique | ✅ graphique 14 jours, détail par journée, correction du contexte, suppression |
| Réglages | ✅ prix, rythme, intervalle recommandé, contextes perso, export, effacement |
| Tables pharmacologique et santé | ⚠️ brouillons non validés : maximums et jalons santé inactifs |
| Coach IA, montre | ⏳ V2 |

## Démarrer

```bash
cd app
npm install
npm start          # puis scanner le QR code avec l'app Expo Go
npm test           # tests du domaine et des cas d'usage
npm run typecheck
npm run lint
```

## Documentation

- [Dossier d'architecture](docs/architecture/README.md) : métier, fonctionnel, applicatif, technique, réseau, résilience, coûts
- [Décisions d'architecture (ADR)](docs/architecture/adr/README.md)

## Pile technique (cible)

React Native + Expo (TypeScript) · SQLite chiffré · expo-notifications · SwiftUI (watchOS) · Compose (Wear OS) · BFF serverless en UE · Claude Haiku 5.5 pour le coach.

## Avertissement

Déclic **ne remplace pas un avis médical**. L'application ne prescrit ni n'ajuste aucun traitement. Pour un accompagnement personnalisé : **Tabac Info Service, 39 89**, votre médecin ou votre pharmacien. En cas d'urgence : **15** ou **112**.

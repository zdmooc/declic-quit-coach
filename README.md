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
| Domaine : observation de 1 à 7 jours (3 par défaut), journées définies par les cigarettes, habitudes, déclencheurs, plan −1/jour ou paliers libres, intervalles, économies, substituts, jalons, notifications | ✅ codé, 124 tests (dont tests par propriétés) |
| Cas d'usage (`Declic`) et ports | ✅ |
| Écrans : profil, page unique, observation et bilan, « J'ai fumé » + contexte, palier | ✅ compteur unique (− jusqu'à l'objectif, + au-delà), moyenne du jour en direct, case patch |
| Stockage | ✅ SQLite sur le téléphone, les données survivent à la fermeture · ⚠️ **non chiffré** dans Expo Go (chiffrement avec le premier build de développement) |
| Notifications | ✅ locales sur le téléphone (expo-notifications), avec boutons « J'ai fumé » / « J'ai résisté » ; pendant l'observation, seul le « bilan prêt » est notifié |
| SOS envie | ✅ 4 respirations guidées au choix (cohérence cardiaque, soupir cyclique, expiration longue, carrée), raisons d'arrêter, chaque SOS compté (résisté ou sans issue), bilan « ce qui marche pour toi » |
| Historique | ✅ graphique par jour / semaine / mois, détail par journée, correction du contexte et de l'heure, suppression, cigarettes avec ou sans patch |
| Substituts | ✅ patch (pose et retrait à l'heure réelle, même après coup, rappel de retrait), pastilles et gommes (prises du jour, dernière prise) · aucun dosage proposé |
| Réglages | ✅ prix, rythme, intervalle recommandé, contextes perso, export, effacement |
| Sauvegarde | ✅ sauvegarde dans un fichier (Téléchargements, Google Drive…) et restauration vérifiée, y compris dès le premier lancement sur un nouveau téléphone |
| Import d'historique | ✅ journal tenu à part (format v2 ou source de préparation) : aperçu, totaux par journée, heures exactes / approximatives / inconnues, rapprochement manuel des doublons, changement d'heure, idempotent ([ADR-0010](docs/architecture/adr/0010-import-historique-migration.md)) |
| Build Android | ✅ APK `preview` via EAS Build · icône et écran de démarrage Déclic |
| Mises à jour automatiques | ✅ EAS Update (canal `preview`) : les nouveaux écrans arrivent sans réinstaller |
| Tables pharmacologique et santé | ⚠️ brouillons non validés : maximums et jalons santé inactifs |
| Progrès | ✅ 📊 statistiques détaillées (14 rubriques), bilan d'observation (par jour, dans l'heure du réveil, avant midi, premier palier proposé), contextes et parades sur 7 jours avec tendance, comparaison avec / sans patch (cigarettes, écarts, moyenne par jour), économies projetées (mois, an), objectifs d'épargne avec date estimée, records, bilan de la semaine, courbe du plan jusqu'à zéro |
| Coach écrit (sans IA) | ✅ bilan du soir, faux pas analysé avec bienveillance, alerte 10 min avant l'heure à risque |
| Coach IA | ✅ codé : conversation (SOS, soir, faux pas), garde-fous (dosage, symptômes, détresse → 15 / 112 / 3114 / 39 89), consentement · modèle open source gratuit (Mistral Small 3.1 via Cloudflare Workers AI) · ⚙️ relais à déployer ([coach-relay](coach-relay/README.md)) |
| Santé | ✅ caféine (☕ en un tap, mg du jour, 7 jours, palier qui ne remonte jamais, cafés suivis d'une cigarette) · bilans biologiques (courbes, évolution, valeurs hors norme ou à surveiller, norme du labo ou objectif du médecin), aliments classés selon toutes les anomalies à la fois (à privilégier / à éliminer) · données locales, jamais envoyées au coach IA |
| Montre | ⏳ V2 |

## Démarrer

```bash
cd app
npm install
npm start          # puis scanner le QR code avec l'app Expo Go
npm test           # tests du domaine et des cas d'usage
npm run typecheck
npm run lint
```

### Installer et mettre à jour sur Android

```bash
npx eas-cli@latest build -p android --profile preview      # APK (seulement si le code natif change)
npx eas-cli@latest update --channel preview --environment preview --message "…"   # mise à jour sans réinstaller
```

## Documentation

- [Dossier d'architecture](docs/architecture/README.md) : métier, fonctionnel, applicatif, technique, réseau, résilience, coûts
- [Décisions d'architecture (ADR)](docs/architecture/adr/README.md)

## Pile technique (cible)

React Native + Expo (TypeScript) · SQLite chiffré · expo-notifications · SwiftUI (watchOS) · Compose (Wear OS) · BFF serverless en UE · coach IA open source (Mistral Small 3.1 via Cloudflare Workers AI, gratuit).

## Avertissement

Déclic **ne remplace pas un avis médical**. L'application ne prescrit ni n'ajuste aucun traitement. Pour un accompagnement personnalisé : **Tabac Info Service, 39 89**, votre médecin ou votre pharmacien. En cas d'urgence : **15** ou **112**.

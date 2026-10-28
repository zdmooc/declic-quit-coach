# Décisions d'architecture (ADR)

| # | Décision | Statut |
|---|---|---|
| [0001](0001-react-native-expo.md) | Application mobile en React Native avec Expo | Accepté |
| [0002](0002-architecture-hexagonale.md) | Architecture hexagonale, domaine en TypeScript pur | Accepté |
| [0003](0003-event-sourcing-local-first.md) | Event sourcing local-first | Accepté |
| [0004](0004-substituts-table-reference-sans-prescription.md) | Substituts : table de référence validée, aucune prescription | Accepté |
| [0005](0005-coach-ia-bff-ue.md) | Coach IA derrière un BFF hébergé en UE | Accepté, remplacé en partie par 0009 |
| [0006](0006-montre-apps-natives-minimales.md) | Montre : notifications d’abord, puis apps natives minimales | Accepté, en attente (voir 0011) |
| [0007](0007-notifications-locales-planificateur.md) | Notifications locales pilotées par un planificateur du domaine | Accepté |
| [0008](0008-journee-definie-par-les-cigarettes.md) | La journée est définie par les cigarettes, pas par l'horloge | Accepté |
| [0009](0009-relais-coach-cloudflare-prototype.md) | Relais du coach IA sur Cloudflare Workers (prototype personnel) | Accepté (prototype) |
| [0010](0010-import-historique-migration.md) | Import d'historique : schéma v2, agrégats sans heure, rapprochement manuel | Accepté |
| [0011](0011-health-connect.md) | Montre et capteurs via Health Connect, en lecture seule | Accepté |

## Décisions ouvertes

- Inclure ou non la base dans la sauvegarde iCloud / Google (et restauration de la clé de chiffrement).
- Fournisseur LLM définitif après l'AIPD (transfert hors UE).
- Modèle économique : gratuit, freemium, B2B (entreprises, mutuelles).
- Connexion et sauvegarde (reporté) : A. verrouillage par empreinte / Face ID (local) ; B. connexion Google facultative pour une sauvegarde **chiffrée** dans le Google Drive de l'utilisateur (pas de serveur Déclic, pas d'HDS ; nécessite le build de développement ; « Se connecter avec Apple » à prévoir sur iOS) ; C. compte avec synchronisation multi-appareils (serveur, hébergement HDS). Orientation : A puis B, C seulement si besoin avéré.

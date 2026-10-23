# Décisions d'architecture (ADR)

| # | Décision | Statut |
|---|---|---|
| [0001](0001-react-native-expo.md) | Application mobile en React Native avec Expo | Accepté |
| [0002](0002-architecture-hexagonale.md) | Architecture hexagonale, domaine en TypeScript pur | Accepté |
| [0003](0003-event-sourcing-local-first.md) | Event sourcing local-first | Accepté |
| [0004](0004-substituts-table-reference-sans-prescription.md) | Substituts : table de référence validée, aucune prescription | Accepté |
| [0005](0005-coach-ia-bff-ue.md) | Coach IA derrière un BFF hébergé en UE | Accepté (V2) |
| [0006](0006-montre-apps-natives-minimales.md) | Montre : notifications d'abord, puis apps natives minimales | Accepté |
| [0007](0007-notifications-locales-planificateur.md) | Notifications locales pilotées par un planificateur du domaine | Accepté |
| [0008](0008-journee-definie-par-les-cigarettes.md) | La journée est définie par les cigarettes, pas par l'horloge | Accepté |

## Décisions ouvertes

- Inclure ou non la base dans la sauvegarde iCloud / Google (et restauration de la clé de chiffrement).
- Fournisseur LLM définitif après l'AIPD (transfert hors UE).
- Modèle économique : gratuit, freemium, B2B (entreprises, mutuelles).

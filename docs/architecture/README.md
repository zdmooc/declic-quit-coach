# Dossier d'architecture — Déclic

| # | Vue | Contenu |
|---|---|---|
| 01 | [Architecture métier](01-architecture-metier.md) | Vision, parties prenantes, capacités, parcours de sevrage, règles métier, KPI, réglementation |
| 02 | [Architecture fonctionnelle](02-architecture-fonctionnelle.md) | Domaines, catalogue des fonctions (MVP / V2 / V3), notifications, cas d'usage, exigences non fonctionnelles |
| 03 | [Architecture applicative](03-architecture-applicative.md) | Hexagonale, contextes métier, 29 événements, projections, flux, modèle de données |
| 04 | [Architecture technique](04-architecture-technique.md) | Déploiement, pile technique, sécurité, environnements, tests, observabilité |
| 05 | [Architecture réseau](05-architecture-reseau.md) | Zones de confiance, matrice des flux, règles réseau, localisation des données, API du relais |
| 06 | [Résilience](06-resilience.md) | Niveaux de service, RPO / RTO, analyse des défaillances, sauvegarde, dégradation du coach |
| 07 | [Estimation des coûts](07-estimation-couts.md) | Coût réel du prototype, tarifs, coût du coach IA, paliers, effort, rentabilité |
| 08 | [Revue d'architecture](08-revue-architecture.md) | Conformité de chaque couche au code, écarts, risques, plan |
| — | [Décisions (ADR)](adr/) | Décisions d'architecture tracées |

## Glossaire

| Terme | Définition |
|---|---|
| **ADR** | Architecture Decision Record : fiche courte qui trace une décision, son contexte et ses conséquences |
| **AIPD** | Analyse d'impact relative à la protection des données (RGPD, art. 35) |
| **BFF** | Backend For Frontend : petite API dédiée à l'app, ici pour le coach IA |
| **CQRS** | Séparation entre l'écriture (commandes) et la lecture (projections) |
| **Event sourcing** | L'état est déduit d'un journal d'événements immuables |
| **HDS** | Hébergement de données de santé (certification française) |
| **Local-first** | Les données vivent d'abord sur l'appareil ; le réseau est optionnel |
| **MAU** | Monthly Active Users : utilisateurs actifs mensuels |
| **MDR** | Règlement européen 2017/745 sur les dispositifs médicaux |
| **OTA** | Over-the-air : mise à jour du code JavaScript sans repasser par les stores |
| **Projection** | Vue de lecture calculée à partir du journal (dans Déclic : recalculée à chaque lecture, jamais stockée) |
| **Health Connect** | Espace santé d'Android où les applications (Zepp, Dexcom, RENPHO) écrivent leurs mesures ; Déclic le lit sans rien écrire |
| **Runtime version** | Empreinte du code natif d'un APK : une mise à jour EAS Update n'est reçue que par les APK de même empreinte |
| **RPO / RTO** | Perte de données maximale admise / temps de reprise maximal |

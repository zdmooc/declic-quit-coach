# 07 — Estimation des coûts

> Statut : **v0.1 — estimation de cadrage** · Tarifs relevés le **2026-10-23**, hors taxes, à revérifier avant tout engagement.
> Les tarifs en dollars sont laissés en dollars (pas de conversion figée).

## 1. Tarifs de référence

| Poste | Tarif relevé | Source |
|---|---|---|
| Apple Developer Program | 99 $ / an | [choicely.com](https://www.choicely.com/tutorials/how-much-does-it-cost-to-publish-an-app) |
| Google Play Console | 25 $ une seule fois | [choicely.com](https://www.choicely.com/tutorials/how-much-does-it-cost-to-publish-an-app) |
| Expo EAS — Free | 0 $ / mois, 1 000 utilisateurs actifs mensuels (MAU) pour EAS Update, builds en faible priorité | [expo.dev/pricing](https://expo.dev/pricing) |
| Expo EAS — Starter | 19 $ / mois + usage, 3 000 MAU EAS Update, 45 $ de crédit de builds prioritaires | [expo.dev/pricing](https://expo.dev/pricing), [docs.expo.dev](https://docs.expo.dev/billing/plans/) |
| Expo EAS — Production | 199 $ / mois + usage, 50 000 MAU EAS Update | [expo.dev/pricing](https://expo.dev/pricing) |
| Scaleway Serverless Functions (Paris) | Gratuit jusqu'à 1 M requêtes et 400 000 Go-s / mois ; puis 0,15 € / M requêtes et 0,50 € / 100 000 Go-s | [scaleway.com](https://www.scaleway.com/en/pricing/serverless/) |
| Claude Haiku 5.5 (API) | 0,10 $ / M tokens en entrée, 0,50 $ / M en sortie, 0,01 $ / M en lecture de cache (prompts ≤ 100 000 tokens) | [platform.claude.com](https://platform.claude.com/docs/en/about-claude/pricing) |
| Claude Sonnet 5.5 (API), pour comparaison | 2 $ / M en entrée, 10 $ / M en sortie, 0,10 $ / M en lecture de cache | [platform.claude.com](https://platform.claude.com/docs/en/about-claude/pricing) |

## 2. Coût unitaire du coach IA

Hypothèses par utilisateur actif du coach :

- **4 échanges par jour** (SOS envies + bilan du soir), 30 jours par mois ;
- par échange : **1 500 tokens** de prompt système **en cache**, **1 000 tokens** de contexte et d'historique, **400 tokens** de réponse.

| Modèle | Coût par échange | Coût par utilisateur et par mois |
|---|---|---|
| **Claude Haiku 5.5** | 0,000315 $ | **≈ 0,038 $** |
| Claude Sonnet 5.5 | 0,00615 $ | ≈ 0,74 $ |

Le choix du modèle est **le premier levier de coût** : un facteur d'environ 20. D'où la décision de partir sur Haiku et de ne monter en gamme que si les évaluations de qualité l'exigent (ADR-0005).

BFF sur Scaleway, hypothèse de 3 s d'exécution à 256 Mo par échange (temps d'attente de la réponse du LLM compris) : le palier gratuit couvre jusqu'à environ 4 400 utilisateurs actifs du coach (la limite atteinte en premier est celle des 400 000 Go-s ; au-delà, le coût reste de l'ordre de quelques euros par mois).

## 3. Coût de fonctionnement mensuel par palier

Hypothèse : à partir de la V2, **50 % des MAU utilisent le coach IA**.

| Poste | MVP (sans coach) | V2 — 1 000 MAU | V2 — 10 000 MAU | V2 — 100 000 MAU |
|---|---|---|---|---|
| Apple (99 $ / an ramenés au mois) | 8,25 $ | 8,25 $ | 8,25 $ | 8,25 $ |
| Expo EAS | 0 $ (Free) | 19 $ (Starter) | 199 $ (Production) | 199 $ + dépassement au-delà de 50 000 MAU (à chiffrer) |
| BFF Scaleway | — | 0 € | ≈ 0,25 € | ≈ 21 € |
| LLM Claude Haiku 5.5 | — | ≈ 19 $ | ≈ 189 $ | ≈ 1 890 $ |
| Sentry, nom de domaine, divers | ≈ 0 à 5 € | ≈ 5 € | ≈ 30 € (à préciser) | ≈ 100 € (à préciser) |
| **Total indicatif** | **≈ 10 à 15 / mois** | **≈ 50 / mois** | **≈ 430 / mois** | **≈ 2 200 / mois + dépassement Expo** |
| *Avec Sonnet 5.5 au lieu de Haiku* | — | ≈ 400 / mois | ≈ 3 900 / mois | ≈ 37 000 / mois |

Coût unitaire indicatif à 10 000 MAU : **≈ 0,04 par MAU et par mois**.

Points non chiffrés à ce stade : dépassements d'usage d'Expo (builds supplémentaires, MAU au-delà du forfait), offre Sentry nécessaire, notifications push serveur (V3).

## 4. Coûts ponctuels

| Poste | Estimation | Commentaire |
|---|---|---|
| Inscription Google Play | 25 $ | Une seule fois |
| Validation par un tabacologue / pharmacien (table de référence, contenus santé) | 1 à 3 k€ (hypothèse) | Vacations ou partenariat ; possible avec un réseau associatif |
| Conseil juridique RGPD + MDR (AIPD, qualification dispositif médical, CGU, politique de confidentialité) | 2 à 6 k€ (hypothèse) | Dépend du statut retenu ; indispensable avant la publication |
| Design (identité, maquettes) | 0 à 5 k€ | Selon que c'est fait en interne ou sous-traité |
| Montres de test (Apple Watch, Wear OS) | 400 à 800 € | Seulement si la V2 montre est lancée |
| Marque (dépôt INPI, une classe) | ≈ 190 € (à vérifier) | Avant de communiquer sur « Déclic » |

## 5. Effort de réalisation

Estimation en jours-homme (JH), pour un développeur expérimenté TypeScript / React Native.

### MVP

| Lot | JH |
|---|---|
| Cadrage UX, parcours, maquettes | 10 |
| Domaine (plan, intervalles, économies, substituts, planificateur) + tests par propriétés | 12 |
| Interface : onboarding, tableau de bord, journal, substituts, SOS scripté, réglages | 25 |
| Persistance chiffrée, migrations, export / import | 6 |
| Notifications locales et actionnables | 6 |
| CI/CD, EAS, publication sur les stores | 5 |
| Contenus santé (rédaction, intégration de la validation) | 4 |
| Tests E2E, accessibilité, recette | 8 |
| Conformité : AIPD, CGU, consentements | 4 |
| **Total MVP** | **≈ 80 JH** |

### V2

| Lot | JH |
|---|---|
| BFF + coach IA + garde-fous + jeu d'évaluation | 20 |
| App Apple Watch (SwiftUI, complication, synchronisation) | 15 |
| App Wear OS (Compose, tuile / complication, synchronisation) | 15 |
| Analyse des heures et contextes à risque, notifications préventives | 8 |
| **Total V2** | **≈ 58 JH** |

### Valorisation

| Hypothèse | MVP | V2 |
|---|---|---|
| Réalisation personnelle (temps libre) | coût monétaire ≈ 0, ≈ 4 mois à mi-temps | ≈ 3 mois à mi-temps |
| Développeur freelance à 500 € / jour (hypothèse) | ≈ 40 k€ | ≈ 29 k€ |

Avec un assistant de code IA, l'effort de développement pur peut baisser sensiblement ; les lots UX, conformité, validation santé et recette baissent beaucoup moins.

## 6. Leviers de réduction des coûts

1. **Haiku par défaut**, Sonnet uniquement pour des cas ciblés (par exemple le bilan hebdomadaire).
2. **Cache du prompt système** (déjà compté dans les hypothèses).
3. **Contexte compact** : le `ContexteCoach` est agrégé, quelques centaines de tokens.
4. **SOS scripté d'abord**, IA en second niveau : beaucoup d'envies passent avec la respiration guidée.
5. **Quota par utilisateur** côté BFF (par exemple 10 échanges par jour), limite de dépense chez le fournisseur.
6. **Local-first** : pas de base serveur, pas d'hébergement HDS, pas de coût de stockage.

## 7. Seuil de rentabilité (ordre de grandeur)

À 10 000 MAU, le coût de fonctionnement est d'environ 430 par mois. Avec un abonnement premium à 3,99 € / mois (hypothèse) et une commission de store de 15 % (programme petites entreprises, à vérifier), il suffit d'environ **130 abonnés** (≈ 1,3 % des MAU) pour couvrir le fonctionnement, hors amortissement de la réalisation.

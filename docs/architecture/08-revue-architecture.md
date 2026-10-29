# 08 — Revue d'architecture

> Revue du 2026-10-28 · Périmètre : dossier `docs/architecture` (01 à 07, ADR 0001 à 0011) confronté au code (`app/`, `coach-relay/`, `.github/`).
> Méthode : lecture de chaque vue, vérification dans le code (imports entre couches, événements, ports, tables, dépendances, workflows), tests et lint.

## 1. Synthèse

| Couche | Vue | Avant la revue | Après la revue |
|---|---|---|---|
| Métier | 01 | ✅ à jour (RM-01 à RM-29) | ✅ |
| Fonctionnelle | 02 | ⚠️ F10 à F14 absents (santé, caféine, montre, statistiques, méthode) | ✅ catalogue complété |
| Modélisation | 03 §4 | ❌ 10 événements sur 29 absents, 2 erronés | ✅ 29 événements documentés |
| Applicative | 03 | ❌ ports, modules, tables de projection ne correspondaient pas au code | ✅ vraies couches, contextes métier, modules, flux Health Connect |
| Technique | 04 | ⚠️ chiffrement SQLCipher annoncé mais absent ; Health Connect et CI/CD absents | ✅ colonne **État** (en place / prévu) |
| Réseau | 05 | ❌ BFF Scaleway au lieu du relais Cloudflare | ✅ zones, flux F0 à F8, contrat du relais |
| Résilience | 06 | ⚠️ défaillances Health Connect et publication non traitées | ✅ D18 à D21 |
| Coûts | 07 | ⚠️ coût réel du prototype absent | ✅ 0 € / mois documenté |
| Décisions | ADR | ⚠️ ADR-0005 et 0006 non mis à jour | ✅ statuts « remplacé en partie » / « en attente » |

## 2. Conformité du code aux patterns

| Pattern | Décision | Vérification | Verdict |
|---|---|---|---|
| Hexagonale (ports & adapters) | ADR-0002 | Le domaine n'importe ni React, ni Expo, ni un adapter ; l'application ne dépend que des ports ; seule la composition root connaît les adapters | ✅ |
| Event sourcing local-first | ADR-0003 | Table `events` en ajout seul, corrections par `SaisieAnnulee` / `CigaretteCorrigee`, rejeu complet (`etat.ts`) | ✅ |
| CQRS léger | ADR-0003 | Écriture = un événement ; lecture = projections pures recalculées | ✅ |
| Strategy | — | `ReductionStrategy` (−1 / jour, −1 / 2 jours, −1 / semaine, paliers libres) | ✅ |
| Anti-corruption | ADR-0010 | `application/migration` traduit les formats v1, v2 et la source du journal Drive | ✅ |
| Adapter protégé | ADR-0011 | Module natif chargé paresseusement ; « indisponible » sans planter | ✅ |
| Composition root | — | `ui/app/creerApplication.ts` assemble tous les adapters | ✅ |

## 3. Écarts relevés et traitement

| # | Écart | Gravité | Traitement |
|---|---|---|---|
| E1 | `App.tsx` appelait directement l'adapter Health Connect (contournement de la couche application) | Moyenne | ✅ corrigé : cas d'usage `Declic.lireMontre()` derrière le port `SourceSante`, testé avec une source factice |
| E2 | `domain/dashboard.ts` (886 lignes) mêlait le rejeu et trois projections | Moyenne | ✅ corrigé : `etat` (rejeu), `journees`, `dashboard` (tableau de bord, façade), `historique` ; 140 tests inchangés |
| E3 | Documentation 02 à 07 arrêtée au 23-24 octobre | Forte | ✅ remise à niveau (ce commit) |
| E4 | `ui/app/donnees.ts` appelle le sélecteur de fichier sans port | Faible | Accepté : action d'interface pure, sans règle métier |
| E5 | `EtatJournal` partagé par tous les contextes (tabac, substituts, caféine, santé, parades) | Faible | Suivi : découper l'état par contexte si un contexte grossit encore |

## 4. Risques et points de vigilance

| # | Risque | Probabilité | Impact | Mesure proposée |
|---|---|---|---|---|
| R1 | Données de santé (bilans) **non chiffrées** sur le téléphone et dans la sauvegarde | Moyenne | Fort | Lot sécurité : SQLCipher + clé dans le Keystore, verrou biométrique, sauvegarde chiffrée |
| R2 | Évolution des événements sans stratégie écrite (tous en `schemaVersion: 1`) | Faible | Moyen | Règle : champs optionnels seulement ; sinon nouvelle version + fonction de montée de version au rejeu |
| R3 | Rejeu complet à chaque lecture | — | — | ✅ traité le 2026-10-29 : journal et état rejoué mis en cache dans `Declic` (invalidés à chaque ajout, effacement, restauration) ; `journeeDe` en recherche dichotomique ; `analyserMontre` regroupé par jour et fenêtres par dichotomie. Voir § 7 |
| R4 | Aucun test d'écran | Moyenne | Moyen | Maestro sur 4 parcours (onboarding, J'ai fumé, SOS, Ma santé) |
| R5 | Coach : code d'accès partagé, pas de jeton par installation | Faible (usage personnel) | Moyen si diffusion | Jeton par installation + Play Integrity avant diffusion |
| R6 | Seuils santé (Fagerström, caféine, pas, sommeil) indicatifs | — | Moyen | Sources citées dans RM-24 à RM-29 ; validation par un professionnel avant diffusion |

## 5. Plan

| Priorité | Action | Couche |
|---|---|---|
| 1 | Lot sécurité (R1) | Technique |
| 2 | Règle d'évolution des événements dans un ADR (R2) | Applicative |
| 3 | Tests d'écran Maestro (R4) | Qualité |
| 4 | Parcours guidé « Où j'en suis » (F14.4) | Fonctionnelle |
| 5 | ~~Cache de l'état rejoué (R3)~~ fait | Applicative |

## 6. Règle de tenue

Toute fonction livrée met à jour, **dans le même commit** : la règle métier (01), la fonction (02), les événements et modules touchés (03), et un ADR si une décision technique change. Cette revue est à refaire à chaque nouveau lot.

## 7. Mesures de performance (2026-10-29)

Journal synthétique : 15 cigarettes, 4 cafés et 3 envies par jour ; mesures Health Connect : 21 000 relevés de fréquence cardiaque sur 29 jours. Temps moyens sur Node (un téléphone est environ 3 à 10 fois plus lent).

| Opération | 1 an (8 032 événements) avant | Après |
|---|---|---|
| Rejeu du journal | 92 ms | 13 ms (une seule fois, puis cache) |
| Tableau de bord | 102 ms | 7 ms |
| Historique (400 jours) | 119 ms | 21 ms |
| Statistiques | 114 ms | 9 ms |
| Progrès | 118 ms | 9 ms |
| Santé | 99 ms | < 1 ms |
| Montre (21 000 mesures) | 250 ms | 8 à 20 ms |
| Enregistrer une cigarette | 105 ms | 22 ms |

Causes trouvées : `journeeDe` parcourait toutes les cigarettes pour chaque envie, café ou prise (coût quadratique) ; chaque écran rejouait le journal, parfois deux fois ; l'analyse de la montre reparcourait toutes les mesures pour chaque jour et chaque cigarette, et appelait `Intl` à chaque mesure.

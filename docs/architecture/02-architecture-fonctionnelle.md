# 02 — Architecture fonctionnelle

> Statut : **v0.1 — brouillon de cadrage** · Dernière mise à jour : 2026-10-23

## 1. Domaines fonctionnels

```mermaid
flowchart LR
  subgraph APP[App mobile Déclic]
    ONB[Onboarding & profil]
    PLAN[Plan de réduction]
    JOUR[Journal - cigarettes, envies]
    SUB[Substituts]
    DASH[Tableau de bord]
    ECO[Économies & objectifs]
    SANTE[Bénéfices santé]
    NOTIF[Notifications]
    COACH[Coach IA]
    PARAM[Réglages, confidentialité, export]
  end
  WATCH[Montre connectée]
  PRO[Professionnels - 39 89, médecin]

  ONB --> PLAN
  PLAN --> DASH
  JOUR --> DASH
  SUB --> DASH
  JOUR --> ECO
  JOUR --> SANTE
  DASH --> NOTIF
  JOUR --> COACH
  SUB --> COACH
  COACH --> PRO
  WATCH <--> JOUR
  WATCH <--> DASH
```

## 2. Catalogue des fonctions

Priorités : **MVP** = première version publiable ; **V2** = coach IA et montre ; **V3** = capteurs et social.

### F1 — Onboarding et profil

| ID | Fonction | Priorité |
|---|---|---|
| F1.1 | Saisir la consommation initiale *n*, le prix du paquet et le nombre de cigarettes par paquet | MVP |
| F1.2 | Saisir les heures de lever et de coucher (valeurs par défaut 7 h – 23 h) | MVP |
| F1.3 | Test de dépendance (Fagerström, 6 questions) | MVP |
| F1.4 | Saisir ses motivations (texte libre, réutilisé par le SOS envie) | MVP |
| F1.5 | Choisir le rythme : −1/jour, −1/2 jours, −1/semaine | MVP |
| F1.6 | Consentements RGPD granulaires (données de santé, notifications, coach IA, données de la montre) | MVP |

### F2 — Plan de réduction

| ID | Fonction | Priorité |
|---|---|---|
| F2.1 | Calculer le quota du jour (RM-01) | MVP |
| F2.2 | Calculer l'intervalle cible et la prochaine cigarette conseillée (RM-02, RM-03) | MVP |
| F2.3 | Proposer un palier en cas de dépassement (RM-04) | MVP |
| F2.4 | Visualiser le plan complet (courbe jusqu'à zéro) | MVP |
| F2.5 | Modifier le rythme en cours de route | MVP |

### F3 — Journal

| ID | Fonction | Priorité |
|---|---|---|
| F3.1 | Bouton « J'ai fumé » : horodatage automatique, correction possible | MVP |
| F3.2 | Contexte optionnel : café, stress, repas, alcool, travail, social, ennui | MVP |
| F3.3 | Bouton « J'ai résisté » : enregistrer une envie surmontée et la stratégie utilisée | MVP |
| F3.4 | Historique et annulation (erreur de saisie) | MVP |
| F3.5 | Analyse des heures et contextes à risque | V2 |

### F4 — Substituts nicotiniques

| ID | Fonction | Priorité |
|---|---|---|
| F4.1 | Déclarer un traitement : type, dosage, source (prescription ou automédication) | MVP |
| F4.2 | Patch : heure de pose, durée de port (16 h ou 24 h), rappel de retrait ou de changement, rotation du site | MVP |
| F4.3 | Pastille ou gomme : enregistrer une prise, compteur journalier, maximum de la notice (RM-09) | MVP |
| F4.4 | Courbe de nicotine **estimée** (indicative), issue de la table de référence | V2 |
| F4.5 | Signal « compensation » : pastilles en hausse pendant que les cigarettes baissent → information et orientation | V2 |

### F5 — Tableau de bord, économies, santé

| ID | Fonction | Priorité |
|---|---|---|
| F5.1 | Compte à rebours vers la prochaine cigarette conseillée | MVP |
| F5.2 | Quota restant du jour, intervalle moyen réel / cible | MVP |
| F5.3 | Économies du jour, cumulées, projetées sur 1 mois et 1 an (RM-06, RM-07) | MVP |
| F5.4 | Objectifs d'épargne (« mon vélo à 400 € ») avec date estimée | MVP |
| F5.5 | Bénéfices santé débloqués dans le temps (contenus sourcés) | MVP |
| F5.6 | Records : plus long intervalle, jours sans tabac | MVP |

### F6 — Notifications

| ID | Type | Exemple | Priorité |
|---|---|---|---|
| F6.1 | Actionnable « J'ai fumé / J'ai résisté » | depuis la notification ou la montre | MVP |
| F6.2 | Prochaine cigarette possible | « Tu peux, ou tu tentes 10 min de plus ? » | MVP |
| F6.3 | Paliers d'économies | « 50 € économisés ! » | MVP |
| F6.4 | Bénéfices santé | « 48 h : le goût revient. » | MVP |
| F6.5 | Progression du plan | « Nouveau palier : 14 aujourd'hui. » | MVP |
| F6.6 | Rappels de substituts | « Retire ton patch » | MVP |
| F6.7 | Bilan hebdomadaire | cigarettes évitées, économies | MVP |
| F6.8 | Préventive (heure à risque) | « C'est souvent ta pause clope. » | V2 |
| F6.9 | Bilan du soir par le coach IA | message personnalisé | V2 |

Règles transverses : plafond de 4 notifications non critiques par jour, heures calmes, priorités (rappel de substitut > plan > célébration), regroupement des célébrations, réglage par catégorie (RM-12).

### F7 — Coach IA

| ID | Fonction | Priorité |
|---|---|---|
| F7.1 | SOS envie **scripté** (hors ligne) : respiration guidée, rappel des motivations, minuteur de 3 à 5 min | MVP |
| F7.2 | SOS envie **conversationnel** (IA) | V2 |
| F7.3 | Bilan du soir et ajustement proposé | V2 |
| F7.4 | Analyse bienveillante d'un faux pas | V2 |
| F7.5 | Garde-fous : refus de dosage, détection de détresse → 39 89 / 15 / 112 (RM-10) | V2 |
| F7.6 | Mention « tu parles à une IA » et lien vers un humain | V2 |

### F8 — Montre connectée

| ID | Fonction | Priorité |
|---|---|---|
| F8.1 | Notifications actionnables relayées par le téléphone | MVP |
| F8.2 | Mini-app : boutons « J'ai fumé » et « SOS », respiration par vibrations | V2 |
| F8.3 | Complication du cadran : prochaine cigarette, quota restant | V2 |
| F8.4 | Lecture du stress (fréquence cardiaque, variabilité) via HealthKit / Health Connect | V3 |
| F8.5 | Détection du geste de fumer (ML, accéléromètre) | V3 (R&D) |

### F9 — Réglages et confidentialité

| ID | Fonction | Priorité |
|---|---|---|
| F9.1 | Export complet des données (JSON chiffré) | MVP |
| F9.2 | Suppression totale en un geste | MVP |
| F9.3 | Verrouillage de l'app (Face ID, empreinte) | MVP |
| F9.4 | Gestion des consentements | MVP |
| F9.5 | Restauration depuis un export | MVP |

## 3. Cas d'utilisation

```mermaid
flowchart LR
  U((Fumeur))
  W((Montre))
  P((Professionnel))
  U --> UC1[Créer son plan]
  U --> UC2[Enregistrer une cigarette]
  U --> UC3[Résister à une envie - SOS]
  U --> UC4[Suivre un substitut]
  U --> UC5[Consulter ses progrès]
  U --> UC6[Discuter avec le coach]
  U --> UC7[Exporter ou supprimer ses données]
  W --> UC2
  W --> UC3
  UC6 -. orientation .-> P
```

## 4. Parcours clé : « J'ai envie »

```mermaid
sequenceDiagram
  actor U as Fumeur
  participant A as App
  participant C as Coach
  U->>A: Appuie sur SOS envie
  A->>A: Vérifie l'intervalle (prochaine cigarette à 10h42)
  A->>U: « Il te reste 18 min. On respire 3 min ? »
  U->>A: Lance la respiration guidée
  alt Envie passée
    U->>A: J'ai résisté
    A->>A: Événement EnvieResistee
    A->>U: « Bravo, 5e envie résistée cette semaine »
  else Envie trop forte
    U->>A: Je fume quand même
    A->>A: Événement CigaretteFumee (contexte saisi)
    A->>U: Message neutre, sans jugement
  end
  opt V2
    A->>C: Résumé minimisé du contexte
    C->>U: Conversation de soutien
  end
```

## 5. Exigences non fonctionnelles

| ID | Exigence | Cible |
|---|---|---|
| ENF-01 | Enregistrer une cigarette en un tap | moins de 1 s, hors ligne |
| ENF-02 | Fonctionnement hors ligne | 100 % des fonctions MVP |
| ENF-03 | Exactitude des calculs | 100 % de couverture de tests du domaine |
| ENF-04 | Confidentialité | aucune donnée de santé identifiante hors du téléphone |
| ENF-05 | Accessibilité | RGAA / WCAG 2.2 AA, tailles de police dynamiques |
| ENF-06 | Langues | français au MVP, anglais en V2 |
| ENF-07 | Plateformes | iOS 16+ et Android 10+ (à confirmer selon la version d'Expo) |
| ENF-08 | Démarrage à froid | moins de 2 s sur un téléphone milieu de gamme |
| ENF-09 | Latence du coach IA | premier mot en moins de 2 s (streaming) |

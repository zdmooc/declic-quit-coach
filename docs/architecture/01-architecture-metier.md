# 01 — Architecture métier

> Statut : **v0.1 — brouillon de cadrage** · Dernière mise à jour : 2026-10-23

## 1. Vision

**Déclic** accompagne un fumeur de *n* cigarettes par jour jusqu'à **zéro**, en retirant **une cigarette par jour** (rythme ajustable), avec :

- un **comptage** de chaque cigarette et de l'**intervalle** entre deux cigarettes ;
- un **suivi des substituts nicotiniques** (patchs, pastilles, gommes) et de leur durée d'effet estimée ;
- un **compteur d'économies** et de bénéfices santé ;
- un **coach IA** qui explique, motive et désamorce les envies — **sans jamais prescrire**.

Proposition de valeur : *« Une cigarette de moins chaque jour, un coach qui comprend tes moments. »*

## 2. Parties prenantes

| Acteur | Rôle | Attentes principales |
|---|---|---|
| **Fumeur / utilisateur** | Acteur principal | Réduire puis arrêter, sans culpabilisation, en voyant ses progrès |
| **Proche / buddy** (V2) | Soutien | Être tenu au courant, encourager au bon moment |
| **Tabacologue / pharmacien** | Caution scientifique | Valider la table pharmacologique et les contenus santé |
| **Médecin traitant** | Prescripteur des substituts | L'app *suit* la prescription, ne la remplace pas |
| **Tabac Info Service (39 89)** | Recours humain | Être proposé en cas de difficulté ou de détresse |
| **Éditeur (porteur du projet)** | Produit, conformité | Conformité RGPD / MDR / stores, soutenabilité économique |
| **Stores (Apple, Google)** | Distribution | Respect des règles « santé » et des allégations |
| **Fournisseur IA** | Sous-traitant | Contrat de traitement des données (DPA), pas d'entraînement sur les données |

## 3. Carte des capacités métier

```mermaid
flowchart TB
  subgraph C1[Connaître le fumeur]
    C11[Profil de consommation]
    C12[Évaluation de la dépendance - Fagerström]
    C13[Motivations personnelles]
  end
  subgraph C2[Planifier le sevrage]
    C21[Plan de réduction -1/jour]
    C22[Rythme et paliers]
    C23[Fenêtre d'intervalles du jour]
  end
  subgraph C3[Suivre la consommation]
    C31[Enregistrement des cigarettes]
    C32[Contexte et déclencheurs]
    C33[Envies résistées]
  end
  subgraph C4[Accompagner les substituts]
    C41[Suivi patch]
    C42[Suivi pastilles / gommes]
    C43[Courbe de nicotine estimée]
  end
  subgraph C5[Motiver]
    C51[Économies]
    C52[Bénéfices santé]
    C53[Records et paliers]
    C54[Notifications]
  end
  subgraph C6[Coacher]
    C61[SOS envie]
    C62[Bilan du soir]
    C63[Analyse bienveillante des faux pas]
    C64[Orientation vers un professionnel]
  end
  C1 --> C2 --> C3
  C3 --> C5
  C4 --> C5
  C3 --> C6
  C4 --> C6
```

## 4. Processus métier : le parcours de sevrage

```mermaid
stateDiagram-v2
  [*] --> Onboarding
  Onboarding --> Reduction : plan validé
  Reduction --> Reduction : jour suivant (quota - 1)
  Reduction --> Palier : quota dépassé / demande de pause
  Palier --> Reduction : palier tenu 1 à 2 jours
  Reduction --> Arret : quota = 0
  Arret --> Maintien : 7 jours sans cigarette
  Maintien --> FauxPas : cigarette enregistrée
  Arret --> FauxPas : cigarette enregistrée
  FauxPas --> Maintien : analyse + reprise
  FauxPas --> Reduction : rechute durable (choix utilisateur)
  Maintien --> [*] : 12 mois sans tabac
```

| Phase | Objectif | Indicateur de sortie |
|---|---|---|
| Onboarding | Connaître la consommation, fixer le plan | Plan validé par l'utilisateur |
| Réduction | Retirer 1 cigarette par jour (rythme configurable) | Quota du jour = 0 |
| Palier | Consolider sans reculer | 1 à 2 jours au quota tenu |
| Arrêt | Premiers jours sans tabac, souvent sous substituts | 7 jours consécutifs |
| Maintien | Prévenir la rechute, réduire les substituts | 12 mois |
| Faux pas | Comprendre, sans remise à zéro punitive | Reprise du plan |

## 5. Règles métier

| ID | Règle |
|---|---|
| RM-01 | **Quota du jour** : `quota(j) = max(0, n − pas × ⌊j / période⌋)` ; rythme par défaut : pas = 1, période = 1 jour. |
| RM-02 | **Intervalle cible** : `temps éveillé du jour ÷ quota(j)` ; si quota = 0, pas d'intervalle, mode arrêt. |
| RM-03 | **Prochaine cigarette conseillée** : `dernière cigarette + intervalle cible`, bornée à l'heure de lever. |
| RM-04 | **Dépassement de quota** : le plan **ne recule pas** automatiquement ; le lendemain, le coach propose un **palier** (même quota) au lieu de baisser. |
| RM-05 | **Faux pas après l'arrêt** : il est enregistré et analysé ; les compteurs « depuis la dernière cigarette » repartent, mais les **économies cumulées et les records sont conservés**. |
| RM-06 | **Prix d'une cigarette** : `prix du paquet ÷ cigarettes par paquet`, versionné dans le temps (un changement de prix ne réécrit pas le passé). |
| RM-07 | **Économie du jour** : `(n_initial − cigarettes fumées ce jour) × prix unitaire du jour`, jamais négative. |
| RM-08 | **Substituts** : l'app **enregistre** la prescription ou l'usage déclaré et applique les **limites de la notice** de la table de référence ; elle **ne calcule ni ne modifie** un dosage. |
| RM-09 | **Maximum de prises** : atteindre le maximum journalier de la notice déclenche une information et une orientation vers un pharmacien. |
| RM-10 | **Coach IA** : il n'émet aucun conseil de dosage ni de diagnostic ; tout symptôme ou signe de détresse déclenche une **orientation** vers le 39 89, le médecin ou le 15/112. |
| RM-11 | **Ton** : aucun message culpabilisant ; le vocabulaire est « faux pas », jamais « échec ». |
| RM-12 | **Notifications** : au plus 4 notifications non critiques par jour, aucune pendant les heures calmes. |

## 6. Objets métier

```mermaid
classDiagram
  class Fumeur {
    consommationInitiale n
    heureLever
    heureCoucher
    motivations
    scoreFagerstrom
  }
  class PlanDeReduction {
    dateDebut
    rythme
    statut
    quotaDuJour()
  }
  class Cigarette {
    horodatage
    contexte
    intensiteEnvie
  }
  class EnvieResistee {
    horodatage
    strategieUtilisee
  }
  class PriseSubstitut {
    type
    dosage
    debut
    fin
  }
  class Prix {
    prixPaquet
    cigarettesParPaquet
    valableDepuis
  }
  class ObjectifEpargne {
    libelle
    montant
  }
  Fumeur "1" --> "1" PlanDeReduction
  Fumeur "1" --> "*" Cigarette
  Fumeur "1" --> "*" EnvieResistee
  Fumeur "1" --> "*" PriseSubstitut
  Fumeur "1" --> "*" Prix
  Fumeur "1" --> "*" ObjectifEpargne
```

## 7. Indicateurs (KPI)

| Indicateur | Définition | Usage |
|---|---|---|
| Taux de respect du quota | jours avec cigarettes ≤ quota ÷ jours du plan | Qualité du plan, ajustement du rythme |
| Intervalle moyen réel / cible | moyenne glissante sur 3 jours | Signal de difficulté |
| Envies résistées | nombre par jour, stratégie qui fonctionne | Personnalisation du coach |
| Jours sans tabac | depuis la dernière cigarette | Motivation, phases |
| Économies cumulées | somme RM-07 | Motivation |
| Rétention J7 / J30 | utilisateurs actifs | Produit |
| Abstinence déclarée à 3 et 6 mois | questionnaire in-app | Efficacité (à valider avec un protocole sérieux) |

## 8. Contraintes réglementaires et éthiques

| Domaine | Contrainte | Conséquence d'architecture |
|---|---|---|
| **RGPD — données de santé** (art. 9) | Consentement explicite, minimisation, droits d'accès et d'effacement | Local-first, export et suppression en un clic, analyse d'impact (AIPD) |
| **HDS** (hébergement de données de santé, France) | Certification obligatoire si l'éditeur héberge des données de santé identifiantes | Pas de stockage serveur au MVP ; le coach ne reçoit qu'un résumé **non identifiant** |
| **Règlement dispositifs médicaux (MDR 2017/745)** | Un logiciel qui calcule une dose ou pose un diagnostic peut être un dispositif médical | RM-08 et RM-10 : suivi et information, **pas de prescription** ; position à valider juridiquement |
| **Loi Évin** | Pas de publicité ni de valorisation du tabac | Aucune marque de cigarettes, aucun visuel valorisant |
| **Règles des stores** | Allégations santé encadrées, sources requises | Contenus sourcés, mentions « ne remplace pas un avis médical » |
| **AI Act (UE)** | Transparence : l'utilisateur sait qu'il parle à une IA | Mention explicite dans le coach |

# ADR-0008 — La journée est définie par les cigarettes, pas par l'horloge

- **Statut** : accepté
- **Date** : 2026-10-23
- **Remplace** : la saisie des heures de lever et de coucher (première version de F1.2, RM-02, RM-03, RM-13)

## Contexte

La première version demandait les heures de lever et de coucher pour découper la journée et calculer l'intervalle cible (temps éveillé ÷ quota). Retour du premier test réel : on ne connaît pas vraiment ces heures, elles varient, et un plan créé le soir comptait des économies depuis 7 h. En revanche, **les cigarettes sont mesurées** à chaque appui sur « J'ai fumé ».

## Décision

1. **Journée de fumeur (RM-14)** : une journée commence à la première cigarette suivant une pause d'au moins **5 h** et prend la date locale de cette cigarette. Avec 6 à 8 h de sommeil, la pause de nuit dépasse toujours 5 h ; une longue pause en journée garde la même date.
2. **Observation de 3 journées (RM-15)** avant le plan : la référence (consommation), les heures habituelles de première et de dernière cigarette et la durée active sont **mesurées**, puis figées au démarrage du plan.
3. **Intervalle cible (RM-02)** = durée active ÷ (quota − 1) ; la première cigarette de la journée n'a pas d'heure imposée (RM-03).
4. **Contexte de chaque cigarette (RM-16)** proposé en un tap, avec correction de l'heure ; analyse des déclencheurs et heures à risque.

## Conséquences

- Aucun changement d'architecture : le journal d'événements contenait déjà les horodatages et le champ `contexte`. Seules les projections changent (modules `sessions`, `habitudes`, `analyse`), ce qui valide ADR-0003.
- Nouveaux événements : `CigaretteCorrigee` ; `PlanDemarre` porte la référence, le quota de départ et les heures habituelles. `HorairesModifies` est supprimé.
- Le plan démarre au plus tôt 3 jours après l'installation (sauf démarrage immédiat).
- Les notifications du matin partent à l'heure habituelle de la première cigarette.
- Limites connues : un travailleur de nuit dont la « nuit » est fragmentée en pauses de moins de 5 h verrait ses journées fusionner ; le seuil pourra devenir un réglage.

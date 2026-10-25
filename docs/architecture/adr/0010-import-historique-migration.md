# ADR-0010 — Import d'historique : schéma v2, agrégats sans heure, rapprochement manuel

- **Statut** : accepté
- **Date** : 2026-10-25

## Contexte

Avant d'installer Déclic, le suivi des 23, 24 et 25 octobre 2026 a été tenu dans un journal (Google Drive) puis préparé dans une source JSON (`declic-historique-migration-source`). Ce journal contient des heures exactes, des heures approximatives (« vers 16 h 10 »), des cigarettes **sans heure** (5 le 24/10), des envies **comptées** mais pas horodatées, des patchs, une journée partielle (23/10), une journée en cours (25/10, arrêtée à 17 h 17) et le **passage à l'heure d'hiver** (nuit du 24 au 25). Trois saisies faites dans l'app pendant cette période peuvent correspondre — ou non — à des cigarettes du journal.

## Décision

1. **Format** : `declic-export` passe en **version 2**, rétrocompatible. Un fichier v1 se lit toujours tel quel ; la v2 ajoute :
   - un bloc `meta` facultatif (`type: 'migration'`, source, période, instant d'arrêt, totaux attendus par journée, éléments non importés) ;
   - des champs facultatifs de **provenance** sur les saisies : `precision` (`exacte` par défaut | `approximative`), `journee` déclarée par la source, `origine`, `note` ;
   - `AgregatSansHeure` : un **nombre** de cigarettes (ou d'envies signalées) d'une journée, **sans aucun horodatage inventé**. Il compte dans le total, jamais dans les intervalles, les heures à risque ni les déclencheurs ;
   - `EnvieSignalee` : une envie signalée, distincte d'une envie résistée.
   L'heure « inconnue » n'existe donc pas sur un événement horodaté : elle passe par l'agrégat.
2. **Source de préparation** : l'app la lit directement et la convertit en v2 (identifiants stables `src-…`). Chaque heure locale est convertie avec le décalage **de son propre instant** (00 h 21 le 25/10 = UTC+2, 10 h 37 = UTC+1) ; une heure UTC fournie qui ne correspond pas est **refusée**.
3. **Journée** : la journée déclarée par la source prime sur la règle RM-14 (pause de 5 h). L'écart est signalé dans l'aperçu (00 h 21 rattachée au 25/10 par le journal, au 24/10 par la règle).
4. **Import additif en trois temps** : *aperçu* (rien n'est écrit) → *choix* → *confirmation*. Aucun événement existant n'est modifié ni supprimé.
5. **Rapprochement manuel** : chaque saisie de l'app proche (≤ 2 h) d'une cigarette du journal est une **divergence** à trancher : même cigarette (heure du journal ou de l'app) ou cigarettes distinctes. L'import reste bloqué tant qu'une divergence n'est pas décidée. Une fusion ajoute une `CigaretteCorrigee` à la saisie de l'app, d'identifiant `<id journal>-rapprochement`.
6. **Idempotence** : identifiants stables + marque de rapprochement → réimporter le même fichier n'ajoute rien et ne repose aucune question.
7. **Contrôle** : la confirmation est refusée si le journal a changé depuis l'aperçu (nombre d'événements différent).
8. **Total réel** : le tableau de bord et l'historique distinguent le compte **pour le quota** (après le démarrage du plan, RM-13) et le **total réel de la journée** (cigarettes d'avant le démarrage et sans heure comprises).

## Conséquences

- Les journées importées affichent le total exact sans fausse précision ; les intervalles ne portent que sur les cigarettes horodatées.
- Le début d'éveil d'une journée se calcule après la dernière pause de nuit : une cigarette d'après minuit rattachée à la journée ne fait pas croire que la journée a commencé à minuit.
- Les données personnelles réelles ne sont pas versionnées : les tests utilisent un jeu synthétique de même structure.
- Non traité dans cette itération : chiffrement des sauvegardes (lot sécurité).

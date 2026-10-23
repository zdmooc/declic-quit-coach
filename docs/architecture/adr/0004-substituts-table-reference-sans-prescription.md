# ADR-0004 — Substituts : table de référence validée, aucune prescription

- **Statut** : accepté
- **Date** : 2026-10-23

## Contexte

L'app suit les patchs, pastilles et gommes et affiche des durées d'effet estimées. Calculer ou ajuster une dose ferait probablement de l'app un **dispositif médical** au sens du règlement MDR 2017/745, et présente un risque pour l'utilisateur si les paramètres sont faux.

## Décision

- Les paramètres (dosages, durées de port, délais de pic, maximums par jour) sont dans `config/pharma-reference.json`, **versionné et validé par un professionnel** (champ `validatedBy`).
- L'app **enregistre** l'usage déclaré, **rappelle** les limites de la notice et **oriente** vers un pharmacien ou un médecin. Elle ne calcule ni ne propose de dose.
- Les courbes de nicotine sont affichées comme **indicatives**, et seulement si la table est validée.

## Conséquences

- Position réglementaire à confirmer par un conseil juridique avant publication.
- Mise à jour des paramètres sans modifier le code (via EAS Update).
- Traçabilité : chaque version de la table est liée à son validateur.

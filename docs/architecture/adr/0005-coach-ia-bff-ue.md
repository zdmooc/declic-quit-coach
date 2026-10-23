# ADR-0005 — Coach IA derrière un BFF hébergé en UE

- **Statut** : accepté (pour la V2)
- **Date** : 2026-10-23

## Contexte

Le coach IA appelle un modèle de langage. Une clé d'API embarquée dans une app mobile s'extrait facilement. Les échanges touchent à la santé. Le coût dépend fortement du modèle choisi (voir 07).

## Décision

- Un **BFF sans état** sur Scaleway Serverless Functions (Paris) porte la clé, l'authentification anonyme, la limite de débit, le budget et les garde-fous.
- L'app n'envoie qu'un **`ContexteCoach` minimisé** ; rien n'est conservé côté serveur.
- **Le LLM explique et motive ; le code calcule.** Aucun chiffre métier ne vient du modèle.
- Modèle par défaut : **Claude Haiku 5.5** ; montée en gamme seulement si le jeu d'évaluation le justifie.
- Garde-fous en entrée (domaine, côté app) et en sortie (BFF) : aucun dosage, orientation vers le 39 89 / 15 / 112 en cas de détresse, mention « tu parles à une IA ».
- Repli systématique vers le **SOS scripté hors ligne**.

## Conséquences

- Coût d'environ 0,04 $ par utilisateur actif du coach et par mois (hypothèses en 07).
- Le transfert vers le fournisseur LLM doit être couvert par un DPA et un mécanisme de transfert conforme ; à valider dans l'AIPD.
- Un jeu d'évaluation des garde-fous tourne en CI à chaque changement du prompt ou du modèle.

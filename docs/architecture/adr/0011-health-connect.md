# ADR-0011 — Montre et capteurs via Health Connect, en lecture seule

- **Statut** : accepté
- **Date** : 2026-10-27

## Contexte

L'utilisateur porte une montre Amazfit (application Zepp) et utilise un capteur de glucose (Dexcom ONE+) et une balance (RENPHO). Ces applications écrivent leurs mesures dans **Health Connect**, l'espace santé d'Android. Le sommeil (heure de réveil), la fréquence cardiaque, l'HRV, la glycémie… éclairent directement la méthode : délai réveil → première cigarette, effet d'une cigarette sur le cœur, stress.

## Décision

1. **Lecture seule** de Health Connect avec `react-native-health-connect` (module natif, plugin Expo, `minSdkVersion` 26). Types lus : sommeil, fréquence cardiaque, fréquence au repos, HRV (RMSSD), pas, SpO2, glycémie, tension, poids. Déclic n'écrit rien dans Health Connect.
2. **Rien n'est enregistré dans le journal** : les mesures sont lues à la demande (14 derniers jours), croisées avec les cigarettes en mémoire (`analyserMontre`, projection pure), puis oubliées. Elles ne sont ni dans les sauvegardes ni envoyées au coach IA.
3. **Chargement protégé** : le module natif est chargé paresseusement ; un APK construit sans lui (ou Expo Go) affiche « non disponible » au lieu de planter.
4. Ajouter un module natif change l'empreinte (runtime version) : **nouvel APK obligatoire**, puis mises à jour EAS Update comme avant.

## Conséquences

- (+) Heure de réveil réelle, effet de la nicotine sur le cœur, sommeil, HRV, glycémie et tension sans saisie.
- (+) Données de santé sensibles gardées hors du journal et hors des sauvegardes.
- (−) Android seulement. La qualité dépend de ce que chaque application écrit dans Health Connect.
- (−) Une diffusion sur le Play Store exigerait la déclaration d'accès aux données Health Connect (non concerné en distribution APK directe).

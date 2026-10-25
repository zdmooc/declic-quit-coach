import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { TableauDeBord } from '../../domain';
import { creerApplication, type Application } from './creerApplication';

/** Ce que l'interface doit faire quand l'utilisateur répond à une notification. */
export interface ReactionsNotifications {
  /** Une cigarette vient d'être enregistrée depuis la notification : demander son contexte. */
  cigaretteEnregistree: (id: string) => void;
  /** Bilan du soir ou de la semaine touché : ouvrir l'écran Progrès. */
  ouvrirProgres: () => void;
}

/**
 * Cycle de vie de l'application : chargement, tableau de bord rafraîchi toutes les 30 s et au
 * retour au premier plan, réponses aux notifications (traitées une seule fois).
 */
export function useApplication(reactions: ReactionsNotifications) {
  const [app, setApp] = useState<Application | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [chargement, setChargement] = useState(true);
  const [tdb, setTdb] = useState<TableauDeBord | null>(null);
  const [coachDispo, setCoachDispo] = useState(false);
  const reponsesTraitees = useRef(new Set<string>());
  // Dernières réactions connues, sans relancer l'abonnement aux notifications à chaque rendu.
  const reactionsRef = useRef(reactions);
  useEffect(() => {
    reactionsRef.current = reactions;
  });

  useEffect(() => {
    creerApplication()
      .then(setApp)
      .catch((e: unknown) => setErreur(e instanceof Error ? e.message : String(e)));
  }, []);

  const rafraichir = useCallback(async () => {
    if (!app) return;
    setTdb(await app.declic.tableauDeBord());
    setCoachDispo(await app.declic.coachIaDisponible());
    setChargement(false);
  }, [app]);

  useEffect(() => {
    // Premier calcul au tour suivant (pas de mise à jour d'état synchrone dans l'effet), puis toutes les 30 s.
    const premier = setTimeout(() => void rafraichir(), 0);
    const timer = setInterval(() => void rafraichir(), 30_000);
    return () => {
      clearTimeout(premier);
      clearInterval(timer);
    };
  }, [rafraichir]);

  // Retour au premier plan : on recalcule l'écran et on reprogramme les notifications.
  useEffect(() => {
    if (!app) return;
    const sub = AppState.addEventListener('change', (etat) => {
      if (etat === 'active') void app.declic.replanifierNotifications().then(rafraichir);
    });
    return () => sub.remove();
  }, [app, rafraichir]);

  // Boutons « J'ai fumé » / « J'ai résisté » dans les notifications (et ouverture à froid).
  useEffect(() => {
    if (!app?.notifications) return;
    const sub = app.notifications.ecouterReponses(({ cle, action }) => {
      if (reponsesTraitees.current.has(cle)) return;
      reponsesTraitees.current.add(cle);
      void (async () => {
        if (action === 'fume') {
          reactionsRef.current.cigaretteEnregistree(await app.declic.enregistrerCigarette(undefined, 'notification'));
        } else if (action === 'resiste') {
          await app.declic.enregistrerEnvieResistee(undefined, 'notification');
        } else if (/^(soir|bilan)-/.test(cle)) {
          reactionsRef.current.ouvrirProgres();
        }
        await rafraichir();
      })();
    });
    return () => sub.remove();
  }, [app, rafraichir]);

  return { app, erreur, chargement, tdb, coachDispo, rafraichir };
}

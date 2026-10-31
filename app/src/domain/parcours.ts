/**
 * « Où j'en suis » (RM-32) : la méthode de l'utilisateur en 4 étapes — observer, descendre par
 * paliers libres, stabiliser à sa limite, puis lots et −1 — avec l'étape en cours, les jours tenus
 * et UNE prochaine action. Rien n'est automatique : chaque passage d'étape est confirmé.
 */

import type { EtatJournal } from './etat';
import { historiqueJournees } from './historique';
import { journeeCourante, proposerPlan, quotaEffectif } from './journees';
import { suiviContextes } from './parades';
import { dateDuZero, strategieCourante } from './reduction';
import { addDays, daysBetween, type Instant } from './time';

export type NumeroEtape = 1 | 2 | 3 | 4;

/** Jours tenus d'affilée avant de proposer de descendre (étape 2) ou de passer au −1 (étape 3). */
export const JOURS_POUR_DESCENDRE = 3;
export const JOURS_POUR_STABILISER = 7;

export type ActionParcours =
  | { cle: 'imposer'; texte: string; quota: number }
  | { cle: 'descendre'; texte: string; quota: number }
  | { cle: 'moins-un'; texte: string }
  | { cle: 'aucune'; texte: string };

export interface Parcours {
  etape: NumeroEtape;
  etapes: { numero: NumeroEtape; nom: string; statut: 'fait' | 'en-cours' | 'a-venir' }[];
  maximum: number | null;
  /** Journées terminées du plan tenues d'affilée (les plus récentes), et sur les 7 dernières. */
  consecutifs: number;
  semaine: { tenus: number; jours: number } | null;
  /** Ce qu'il faut savoir sur l'étape, en une phrase. */
  constat: string;
  action: ActionParcours;
  /** Action secondaire : « j'ai trouvé ma limite » (étape 2) ou retour aux paliers libres (étape 4). */
  secondaire: { cle: 'stabiliser' | 'paliers-libres'; texte: string } | null;
  /** Étape 3 : contextes qui persistent malgré les parades. */
  persistants: string[];
}

const NOMS: Record<NumeroEtape, string> = { 1: 'Observer', 2: 'Paliers libres', 3: 'Stabiliser', 4: 'Lots et −1' };

export function ouJenSuis(etat: EtatJournal, maintenant: Instant, tz: string): Parcours {
  const aujourdhui = journeeCourante(etat, maintenant, tz);
  const plan = etat.plan;
  const strategie = plan ? strategieCourante(plan.input, addDays(aujourdhui, 1)) : null;
  const etape: NumeroEtape = !plan ? 1 : strategie && strategie.pas > 0 ? 4 : etat.stabilisationDepuis ? 3 : 2;

  // Journées terminées du plan, des plus récentes aux plus anciennes.
  const terminees = plan ? historiqueJournees(etat, maintenant, tz, 30).filter((j) => j.jour !== aujourdhui && j.quota !== null) : [];
  let consecutifs = 0;
  for (const j of terminees) {
    if (j.fumees > j.quota!) break;
    consecutifs++;
  }
  const sept = terminees.slice(0, 7);
  const semaine = sept.length ? { tenus: sept.filter((j) => j.fumees <= j.quota!).length, jours: sept.length } : null;
  const maximum = plan ? quotaEffectif(etat, aujourdhui) : null;
  const etapes = ([1, 2, 3, 4] as NumeroEtape[]).map((numero) => ({
    numero,
    nom: NOMS[numero],
    statut: numero < etape ? ('fait' as const) : numero === etape ? ('en-cours' as const) : ('a-venir' as const),
  }));
  const pluriel = (n: number) => `${n} jour${n > 1 ? 's' : ''}`;

  if (etape === 1) {
    const obs = proposerPlan(etat, maintenant, tz);
    const quota = obs.proposition.quotaDepart;
    return {
      etape, etapes, maximum, consecutifs: 0, semaine: null, persistants: [], secondaire: null,
      constat: obs.terminee
        ? `Observation terminée : ≈ ${Math.round(obs.habitudes?.cigarettesParJour ?? obs.proposition.referenceParJour)} cigarettes par jour.`
        : `Observation : ${obs.joursMesures} / ${obs.joursRequis} journée${obs.joursRequis > 1 ? 's' : ''} mesurée${obs.joursMesures > 1 ? 's' : ''}. Fume normalement et note tout.`,
      action: obs.terminee
        ? { cle: 'imposer', texte: `Imposer ton maximum : ${quota} par jour`, quota }
        : { cle: 'aucune', texte: 'Continue d’observer : le bilan arrive à la fin.' },
    };
  }

  if (etape === 2) {
    const reste = Math.max(0, JOURS_POUR_DESCENDRE - consecutifs);
    return {
      etape, etapes, maximum, consecutifs, semaine, persistants: [],
      constat: `Maximum ${maximum} · tenu ${pluriel(consecutifs)} d’affilée.`,
      action:
        reste === 0 && maximum! > 0
          ? { cle: 'descendre', texte: `Tu tiens ${maximum} depuis ${pluriel(consecutifs)} : descendre à ${maximum! - 1} ?`, quota: maximum! - 1 }
          : { cle: 'aucune', texte: `Tiens ${maximum} encore ${pluriel(reste)} d’affilée, puis tu pourras descendre.` },
      secondaire: { cle: 'stabiliser', texte: 'J’ai trouvé ma limite : stabiliser à ce niveau' },
    };
  }

  if (etape === 3) {
    const depuis = etat.stabilisationDepuis!;
    const tenusDepuis = Math.min(consecutifs, Math.max(0, daysBetween(depuis, aujourdhui)));
    const reste = Math.max(0, JOURS_POUR_STABILISER - tenusDepuis);
    const persistants = suiviContextes(etat, aujourdhui).filter((c) => c.tendance === 'persiste').map((c) => c.libelle);
    return {
      etape, etapes, maximum, consecutifs, semaine, persistants, secondaire: null,
      constat: `Stabilisation à ${maximum} · ${pluriel(tenusDepuis)} tenu${tenusDepuis > 1 ? 's' : ''} sur ${JOURS_POUR_STABILISER}.`,
      action:
        reste === 0
          ? { cle: 'moins-un', texte: `Stable depuis ${pluriel(tenusDepuis)} : passer aux lots et au −1 ?` }
          : { cle: 'aucune', texte: `Encore ${pluriel(reste)} tenu${reste > 1 ? 's' : ''} à ${maximum}, en travaillant les contextes qui persistent.` },
    };
  }

  const zero = dateDuZero(plan!.input);
  return {
    etape, etapes, maximum, consecutifs, semaine, persistants: [],
    constat: `Maximum ${maximum} aujourd’hui, baisse automatique${zero ? ` jusqu’à zéro le ${zero.slice(8, 10)}/${zero.slice(5, 7)}` : ''}.`,
    action: { cle: 'aucune', texte: 'Le maximum baisse tout seul selon ton rythme. Un jour difficile ? « Garder le même quota ».' },
    secondaire: { cle: 'paliers-libres', texte: 'Revenir aux paliers libres (je choisis quand descendre)' },
  };
}

/**
 * Contextes et parades (méthode : identifier chaque contexte, remplacer l'ancien réflexe par une
 * nouvelle habitude, puis voir quels contextes persistent). Projection pure du journal rejoué.
 */

import { libelleContexte } from './analyse';
import type { EtatJournal } from './dashboard';
import type { ContexteCigarette } from './events';
import { addDays, type LocalDate } from './time';

export type Tendance = 'a-observer' | 'nouveau' | 'persiste' | 'en-baisse' | 'disparu';

export interface SuiviContexte {
  contexte: ContexteCigarette;
  libelle: string;
  parade: string | null;
  /** Cigarettes dans ce contexte, jour par jour, du plus ancien à aujourd'hui (inclus). */
  parJour: number[];
  fumees: number;
  /** Envies résistées dans ce contexte sur la même période. */
  resistees: number;
  tendance: Tendance;
}

/** Idées de départ, affichées en exemple : c'est l'utilisateur qui choisit sa parade. */
export const IDEES_PARADES: Partial<Record<string, string>> = {
  cafe: 'café sans cigarette, à un autre endroit',
  stress: 'respiration 3 min (SOS envie)',
  repas: 'se lever de table, se brosser les dents',
  alcool: 'verre d’eau entre deux verres',
  travail: 'pause marche ou boisson, sans fumeurs',
  social: 'rester à l’intérieur, mains occupées',
  ennui: 'marcher 5 min, occuper ses mains',
};

/**
 * Suivi des contextes sur `jours` journées (aujourd'hui compris), le plus fréquent d'abord.
 * Tendance calculée sur les journées terminées : les 2 dernières contre les précédentes.
 */
export function suiviContextes(etat: EtatJournal, aujourdhui: LocalDate, jours = 7): SuiviContexte[] {
  const dates = Array.from({ length: jours }, (_, i) => addDays(aujourdhui, i - jours + 1));
  const index = new Map(dates.map((d, i) => [d, i]));
  const lignes = new Map<ContexteCigarette, { parJour: number[]; resistees: number }>();
  const ligne = (c: ContexteCigarette) => {
    if (!lignes.has(c)) lignes.set(c, { parJour: dates.map(() => 0), resistees: 0 });
    return lignes.get(c)!;
  };
  for (const c of etat.cigarettes) {
    const i = index.get(c.jour);
    if (i !== undefined && c.contexte) ligne(c.contexte).parJour[i]!++;
  }
  for (const e of etat.envies) if (e.contexte && index.has(e.jour)) ligne(e.contexte).resistees++;
  for (const c of Object.keys(etat.parades) as ContexteCigarette[]) ligne(c);

  // Journées terminées où au moins une cigarette a été notée (les autres ne disent rien).
  const notees = new Set(etat.cigarettes.map((c) => c.jour));
  const terminees = dates.slice(0, -1).map((d, i) => ({ d, i })).filter(({ d }) => notees.has(d));

  return [...lignes.entries()]
    .map(([contexte, l]) => {
      const fumees = l.parJour.reduce((s, n) => s + n, 0);
      return {
        contexte,
        libelle: libelleContexte(contexte, etat.contextesPerso),
        parade: etat.parades[contexte] ?? null,
        parJour: l.parJour,
        fumees,
        resistees: l.resistees,
        tendance: tendance(terminees.map(({ i }) => l.parJour[i]!)),
      };
    })
    .sort((a, b) => b.fumees - a.fumees || b.resistees - a.resistees);
}

function tendance(valeurs: readonly number[]): Tendance {
  if (valeurs.length < 3) return 'a-observer';
  const recents = valeurs.slice(-2);
  const avant = valeurs.slice(0, -2);
  const moy = (xs: readonly number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  if (moy(avant) === 0) return moy(recents) > 0 ? 'nouveau' : 'a-observer';
  if (moy(recents) === 0) return 'disparu';
  return moy(recents) <= moy(avant) * 0.75 ? 'en-baisse' : 'persiste';
}

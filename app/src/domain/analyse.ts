/**
 * Analyse des déclencheurs et des heures à risque (RM-16), à partir des contextes
 * renseignés par l'utilisateur. Sert à l'affichage, aux notifications préventives et au coach.
 */

import type { ContexteCigarette } from './events';
import { minutesOfDay, type Instant } from './time';

export const LIBELLES_CONTEXTE: Record<ContexteCigarette, string> = {
  cafe: 'Café',
  stress: 'Stress',
  repas: 'Après le repas',
  alcool: 'Alcool',
  travail: 'Pause au travail',
  social: 'Avec d’autres fumeurs',
  ennui: 'Ennui',
  autre: 'Autre',
};

export const CONTEXTES: ContexteCigarette[] = ['cafe', 'stress', 'repas', 'alcool', 'travail', 'social', 'ennui', 'autre'];

export interface Declencheur {
  contexte: ContexteCigarette;
  nombre: number;
  /** Part parmi les cigarettes dont le contexte est renseigné (0 à 1). */
  part: number;
}

export interface Analyse {
  cigarettes: number;
  avecContexte: number;
  declencheurs: Declencheur[];
  /** Heures (0 à 23) les plus fréquentes, de la plus fréquente à la moins fréquente. */
  heuresARisque: { heure: number; nombre: number }[];
}

export function analyser(
  cigarettes: readonly { a: Instant; contexte?: ContexteCigarette }[],
  tz: string,
  top = 3,
): Analyse {
  const parContexte = new Map<ContexteCigarette, number>();
  const parHeure = new Map<number, number>();
  let avecContexte = 0;
  for (const c of cigarettes) {
    if (c.contexte) {
      avecContexte++;
      parContexte.set(c.contexte, (parContexte.get(c.contexte) ?? 0) + 1);
    }
    const h = Math.floor(minutesOfDay(c.a, tz) / 60);
    parHeure.set(h, (parHeure.get(h) ?? 0) + 1);
  }
  const declencheurs = [...parContexte.entries()]
    .map(([contexte, nombre]) => ({ contexte, nombre, part: nombre / avecContexte }))
    .sort((a, b) => b.nombre - a.nombre || CONTEXTES.indexOf(a.contexte) - CONTEXTES.indexOf(b.contexte))
    .slice(0, top);
  const heuresARisque = [...parHeure.entries()]
    .map(([heure, nombre]) => ({ heure, nombre }))
    .sort((a, b) => b.nombre - a.nombre || a.heure - b.heure)
    .slice(0, top);
  return { cigarettes: cigarettes.length, avecContexte, declencheurs, heuresARisque };
}

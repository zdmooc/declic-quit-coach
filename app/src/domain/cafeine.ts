/**
 * Caféine (RM-25) : même méthode que pour la cigarette — observer, descendre par paliers,
 * ne jamais remonter au-dessus du palier précédent. Projection pure du journal rejoué.
 * Repère : 400 mg de caféine par jour pour un adulte (EFSA, 2015). Teneurs moyennes indicatives.
 */

import type { EtatJournal } from './dashboard';
import { addDays, type Instant, type LocalDate } from './time';

export type Boisson = 'cafe' | 'the' | 'cola' | 'energisant' | 'deca';

export const BOISSONS: readonly { cle: Boisson; nom: string; mg: number }[] = [
  { cle: 'cafe', nom: 'Café', mg: 80 },
  { cle: 'the', nom: 'Thé', mg: 40 },
  { cle: 'cola', nom: 'Cola', mg: 35 },
  { cle: 'energisant', nom: 'Boisson énergisante', mg: 80 },
  { cle: 'deca', nom: 'Déca', mg: 3 },
];

export const REPERE_CAFEINE_MG = 400;
/** Une cigarette dans les 20 minutes après une boisson est comptée « avec le café ». */
const FENETRE_CIGARETTE_MINUTES = 20;

const mgDe = (b: Boisson) => BOISSONS.find((x) => x.cle === b)?.mg ?? 0;
/** Les boissons comptées pour le palier : tout sauf le déca. */
const compte = (b: Boisson) => b !== 'deca';

export interface SuiviCafeine {
  aujourdhui: { boissons: number; mg: number };
  /** Palier du jour (boissons caféinées par jour) ; `null` tant qu'aucun palier n'est fixé. */
  quota: number | null;
  /** 7 journées, de la plus ancienne à aujourd'hui. */
  parJour: { jour: LocalDate; boissons: number; mg: number }[];
  /** Moyenne des journées terminées où au moins une boisson a été notée. */
  moyenneParJour: number | null;
  /** Sur 7 jours : boissons caféinées suivies d'une cigarette dans les 20 minutes. */
  suiviesDeCigarette: number;
  totalSept: number;
  derniere: { id: string; a: Instant; boisson: Boisson } | null;
}

export function suiviCafeine(etat: EtatJournal, aujourdhui: LocalDate): SuiviCafeine {
  const dates = Array.from({ length: 7 }, (_, i) => addDays(aujourdhui, i - 6));
  const parJour = dates.map((jour) => {
    const bs = etat.boissons.filter((b) => b.jour === jour);
    return { jour, boissons: bs.filter((b) => compte(b.boisson)).length, mg: bs.reduce((s, b) => s + mgDe(b.boisson), 0) };
  });
  const sept = etat.boissons.filter((b) => dates.includes(b.jour) && compte(b.boisson));
  const fenetre = FENETRE_CIGARETTE_MINUTES * 60_000;
  const suivies = sept.filter((b) => etat.cigarettes.some((c) => c.a >= b.a && c.a - b.a <= fenetre)).length;
  const terminees = parJour.slice(0, -1).filter((j) => j.boissons > 0);
  const d = etat.boissons.at(-1);
  return {
    aujourdhui: { boissons: parJour.at(-1)!.boissons, mg: parJour.at(-1)!.mg },
    quota: etat.quotaCafeine,
    parJour,
    moyenneParJour: terminees.length === 0 ? null : terminees.reduce((s, j) => s + j.boissons, 0) / terminees.length,
    suiviesDeCigarette: suivies,
    totalSept: sept.length,
    derniere: d ? { id: d.id, a: d.a, boisson: d.boisson } : null,
  };
}

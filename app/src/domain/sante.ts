/**
 * Suivi biologique et alimentation (RM-23, RM-24).
 * L'app trace les bilans saisis par l'utilisateur, repère les valeurs hors norme ou proches d'une
 * limite, et classe les aliments selon TOUTES les anomalies à la fois : un aliment n'est conseillé
 * que s'il n'en aggrave aucune. Aucun objectif chiffré ni traitement : c'est le rôle du médecin.
 *
 * Sources des effets alimentaires : recommandations ESC/EAS sur les dyslipidémies (2019, mode de
 * vie), ANSES (sources de vitamine B12, repères du PNNS). Effets retenus seulement s'ils sont
 * établis ; « 0 » = pas d'effet notable retenu.
 */

import type { LocalDate } from './time';

export type Objectif = 'ldl' | 'hdl' | 'tg' | 'b12' | 'glycemie' | 'inflammation';

export interface Parametre {
  cle: string;
  nom: string;
  unite: string;
  /** Norme usuelle de l'adulte, à remplacer par celle du laboratoire. */
  min?: number;
  max?: number;
  /** Objectif alimentaire concerné quand la valeur est trop haute / trop basse. */
  siHaut?: Objectif;
  siBas?: Objectif;
  /** Seuil de vigilance propre au paramètre (remplace la marge de 15 %). */
  vigilanceSous?: number;
  vigilanceDes?: number;
  /** Paramètre calculé (non saisi). */
  calcule?: true;
  note?: string;
}

export const PARAMETRES: readonly Parametre[] = [
  { cle: 'ldl', nom: 'LDL (mauvais cholestérol)', unite: 'g/L', max: 1.6, siHaut: 'ldl', note: 'L’objectif LDL dépend de ton risque cardiovasculaire : il est fixé par ton cardiologue.' },
  { cle: 'hdl', nom: 'HDL (bon cholestérol)', unite: 'g/L', min: 0.4, siBas: 'hdl' },
  { cle: 'ct', nom: 'Cholestérol total', unite: 'g/L', max: 2.0, siHaut: 'ldl' },
  { cle: 'nonhdl', nom: 'Non-HDL', unite: 'g/L', max: 1.9, siHaut: 'ldl', calcule: true },
  { cle: 'tg', nom: 'Triglycérides', unite: 'g/L', max: 1.5, siHaut: 'tg' },
  { cle: 'glycemie', nom: 'Glycémie à jeun', unite: 'g/L', min: 0.7, max: 1.1, siHaut: 'glycemie' },
  { cle: 'hba1c', nom: 'HbA1c', unite: '%', max: 6.0, vigilanceDes: 5.7, siHaut: 'glycemie', note: 'À partir de 5,7 %, l’HbA1c est à surveiller.' },
  { cle: 'crp', nom: 'CRP', unite: 'mg/L', max: 5, siHaut: 'inflammation' },
  { cle: 'leucocytes', nom: 'Leucocytes', unite: 'G/L', min: 4, max: 10, siHaut: 'inflammation', note: 'Le tabac fait monter les leucocytes.' },
  { cle: 'plaquettes', nom: 'Plaquettes', unite: 'G/L', min: 150, max: 400, siHaut: 'inflammation', note: 'Le tabac peut faire monter les plaquettes.' },
  { cle: 'b12', nom: 'Vitamine B12', unite: 'pg/mL', min: 200, max: 900, siBas: 'b12', vigilanceSous: 300, note: 'Entre 200 et 300 pg/mL, la B12 est en zone basse : à surveiller.' },
];

export const parametre = (cle: string) => PARAMETRES.find((p) => p.cle === cle);

/** Une valeur à moins de 15 % d'une limite est « à surveiller ». */
const MARGE_PROCHE = 0.15;

export type Statut = 'normal' | 'proche-haut' | 'proche-bas' | 'haut' | 'bas';

export function statutValeur(valeur: number, norme: { min?: number; max?: number }, vigilanceSous?: number, vigilanceDes?: number): Statut {
  if (norme.max !== undefined && valeur > norme.max) return 'haut';
  if (norme.min !== undefined && valeur < norme.min) return 'bas';
  if (vigilanceSous !== undefined && valeur < vigilanceSous) return 'proche-bas';
  if (vigilanceDes !== undefined && valeur >= vigilanceDes) return 'proche-haut';
  if (norme.max !== undefined && valeur >= norme.max * (1 - MARGE_PROCHE)) return 'proche-haut';
  if (norme.min !== undefined && valeur <= norme.min * (1 + MARGE_PROCHE)) return 'proche-bas';
  return 'normal';
}

export interface Bilan {
  id: string;
  date: LocalDate;
  valeurs: Record<string, number>;
}

export interface SuiviParametre {
  parametre: Parametre;
  norme: { min?: number; max?: number };
  /** Du plus ancien au plus récent. */
  points: { date: LocalDate; valeur: number }[];
  derniere: { date: LocalDate; valeur: number; statut: Statut } | null;
  /** Évolution entre la première et la dernière valeur (en %), `null` s'il n'y a qu'une valeur. */
  evolution: number | null;
}

/** Valeurs d'un bilan, non-HDL calculé si le cholestérol total et le HDL sont connus. */
export function valeursCompletes(b: Bilan): Record<string, number> {
  const v = { ...b.valeurs };
  if (v.nonhdl === undefined && v.ct !== undefined && v.hdl !== undefined) v.nonhdl = Math.round((v.ct - v.hdl) * 100) / 100;
  return v;
}

export function suiviBiologique(bilans: readonly Bilan[], normes: Readonly<Record<string, { min?: number; max?: number }>>): SuiviParametre[] {
  const tries = [...bilans].sort((a, b) => a.date.localeCompare(b.date));
  return PARAMETRES.map((p) => {
    const norme = normes[p.cle] ?? { ...(p.min !== undefined ? { min: p.min } : {}), ...(p.max !== undefined ? { max: p.max } : {}) };
    const points = tries.flatMap((b) => {
      const v = valeursCompletes(b)[p.cle];
      return v === undefined ? [] : [{ date: b.date, valeur: v }];
    });
    const d = points.at(-1);
    return {
      parametre: p,
      norme,
      points,
      derniere: d ? { ...d, statut: statutValeur(d.valeur, norme, p.vigilanceSous, p.vigilanceDes) } : null,
      evolution: points.length >= 2 ? ((d!.valeur - points[0]!.valeur) / points[0]!.valeur) * 100 : null,
    };
  }).filter((s) => s.points.length > 0);
}

/** Objectifs alimentaires actifs : paramètres hors norme ou proches d'une limite au dernier bilan. */
export function objectifsActifs(suivi: readonly SuiviParametre[]): { objectif: Objectif; raisons: string[] }[] {
  const m = new Map<Objectif, string[]>();
  for (const s of suivi) {
    const st = s.derniere?.statut;
    const o = st === 'haut' || st === 'proche-haut' ? s.parametre.siHaut : st === 'bas' || st === 'proche-bas' ? s.parametre.siBas : undefined;
    if (o) m.set(o, [...(m.get(o) ?? []), s.parametre.nom]);
  }
  return [...m.entries()].map(([objectif, raisons]) => ({ objectif, raisons }));
}

export const OBJECTIFS: Record<Objectif, { titre: string; conseil: string }> = {
  ldl: {
    titre: 'Baisser le LDL',
    conseil:
      'Moins de graisses saturées (fromages, beurre, crème, viande grasse, charcuterie, viennoiseries), plus de fibres solubles (avoine, légumineuses), fruits à coque, huiles d’olive et de colza. L’objectif et un éventuel traitement se décident avec ton cardiologue.',
  },
  hdl: {
    titre: 'Monter le HDL',
    conseil: 'Arrêter le tabac est le levier le plus fort. Activité physique régulière, bonnes graisses (huile d’olive, fruits à coque, poissons gras).',
  },
  tg: { titre: 'Baisser les triglycérides', conseil: 'Moins de sucres, de boissons sucrées, de jus, de farines raffinées et d’alcool ; poissons gras 2 à 3 fois par semaine.' },
  b12: {
    titre: 'Monter la B12',
    conseil:
      'La B12 vient des produits animaux : poissons gras, coquillages, laitages nature, volaille. Si elle reste basse malgré l’alimentation, en parler au médecin (absorption, complément).',
  },
  glycemie: { titre: 'Mieux contrôler le sucre', conseil: 'Céréales complètes, légumineuses, légumes ; moins de sucres rapides, de jus et de pain blanc.' },
  inflammation: {
    titre: 'Réduire l’inflammation',
    conseil: 'Le tabac fait monter la CRP, les leucocytes et les plaquettes : chaque palier de descente compte. Alimentation de type méditerranéen.',
  },
};

export interface Aliment {
  nom: string;
  groupe: string;
  /** +1 aide, −1 aggrave, absent = pas d'effet notable retenu. */
  effets: Partial<Record<Objectif, 1 | -1>>;
  attention?: string;
}

const A = (nom: string, groupe: string, effets: Aliment['effets'], attention?: string): Aliment => ({ nom, groupe, effets, ...(attention ? { attention } : {}) });

export const ALIMENTS: readonly Aliment[] = [
  A('Sardine, maquereau, hareng', 'Poissons', { b12: 1, tg: 1, hdl: 1, inflammation: 1 }),
  A('Saumon, truite', 'Poissons', { b12: 1, tg: 1, hdl: 1, inflammation: 1 }),
  A('Poissons maigres (cabillaud, colin, lieu…)', 'Poissons', { b12: 1 }),
  A('Moules, palourdes, huîtres', 'Poissons', { b12: 1 }),
  A('Crevettes', 'Poissons', { b12: 1, ldl: -1 }),
  A('Skyr, yaourt nature, fromage blanc, kéfir', 'Laitages', { b12: 1 }),
  A('Lait demi-écrémé', 'Laitages', { b12: 1 }),
  A('Fromages affinés', 'Laitages', { b12: 1, ldl: -1 }),
  A('Beurre, crème', 'Matières grasses', { ldl: -1 }),
  A('Huile d’olive vierge extra', 'Matières grasses', { ldl: 1, hdl: 1, inflammation: 1 }),
  A('Huile de colza, huile de noix', 'Matières grasses', { ldl: 1, tg: 1 }),
  A('Avocat', 'Matières grasses', { ldl: 1 }),
  A('Poulet, dinde sans peau', 'Viandes et œufs', { b12: 1 }),
  A('Œufs', 'Viandes et œufs', { b12: 1, ldl: -1 }, 'Cas limite : effet modeste chez beaucoup de gens, à voir avec ton cardiologue.'),
  A('Viande rouge grasse', 'Viandes et œufs', { b12: 1, ldl: -1, inflammation: -1 }),
  A('Foie, abats', 'Viandes et œufs', { b12: 1, ldl: -1 }),
  A('Charcuterie', 'Viandes et œufs', { ldl: -1, inflammation: -1 }),
  A('Flocons et son d’avoine', 'Céréales', { ldl: 1, glycemie: 1 }),
  A('Orge, sarrasin, quinoa, céréales complètes', 'Céréales', { glycemie: 1, ldl: 1 }),
  A('Pain blanc, riz blanc, pâtes blanches', 'Céréales', { glycemie: -1, tg: -1 }),
  A('Viennoiseries, pâtisseries, biscuits', 'Céréales', { ldl: -1, tg: -1, glycemie: -1 }),
  A('Lentilles, pois chiches, haricots secs', 'Légumineuses', { ldl: 1, glycemie: 1 }),
  A('Tofu, edamame, soja', 'Légumineuses', { ldl: 1 }),
  A('Noix, amandes, noisettes, pistaches (nature)', 'Fruits à coque', { ldl: 1, hdl: 1 }),
  A('Graines de lin moulues, chia', 'Fruits à coque', { ldl: 1 }),
  A('Légumes (toutes sortes)', 'Légumes et fruits', { ldl: 1, glycemie: 1, inflammation: 1 }),
  A('Fruits rouges, pommes, agrumes (entiers)', 'Légumes et fruits', { inflammation: 1 }),
  A('Pamplemousse, pomelo', 'Légumes et fruits', {}, 'Interagit avec certaines statines et d’autres médicaments : vérifier avec ton médecin ou ton pharmacien.'),
  A('Jus de fruits', 'Boissons', { glycemie: -1, tg: -1 }),
  A('Sodas, boissons sucrées', 'Boissons', { glycemie: -1, tg: -1 }),
  A('Alcool', 'Boissons', { tg: -1, inflammation: -1 }),
  A('Eau, infusions sans sucre', 'Boissons', {}),
];

export interface ClasseAliment {
  aliment: Aliment;
  /** Objectifs actifs que l'aliment aide / aggrave. */
  aide: Objectif[];
  aggrave: Objectif[];
}

/**
 * Règle stricte : à éliminer dès qu'il aggrave UNE anomalie active ; à privilégier s'il en aide au
 * moins une sans en aggraver aucune ; neutre sinon.
 */
export function classerAliments(actifs: readonly Objectif[]): { privilegier: ClasseAliment[]; eliminer: ClasseAliment[]; neutres: ClasseAliment[] } {
  const classes = ALIMENTS.map((aliment) => ({
    aliment,
    aide: actifs.filter((o) => aliment.effets[o] === 1),
    aggrave: actifs.filter((o) => aliment.effets[o] === -1),
  }));
  return {
    privilegier: classes.filter((c) => c.aggrave.length === 0 && c.aide.length > 0).sort((a, b) => b.aide.length - a.aide.length),
    eliminer: classes.filter((c) => c.aggrave.length > 0),
    neutres: classes.filter((c) => c.aggrave.length === 0 && c.aide.length === 0),
  };
}

/**
 * Techniques de respiration du SOS envie et bilan personnel : laquelle aide le mieux.
 * Aucune technique avec rétention prolongée (4-7-8) : risque d'étourdissement.
 */

export type CleTechnique = 'coherence' | 'soupir' | 'expiration' | 'carree';

export interface PhaseRespiration {
  consigne: string;
  secondes: number;
  /** Taille visée du cercle (0,6 à 1) ; `null` = rétention, le cercle ne bouge pas. */
  vers: number | null;
}

export interface TechniqueRespiration {
  cle: CleTechnique;
  nom: string;
  description: string;
  phases: readonly PhaseRespiration[];
}

export const TECHNIQUES: readonly TechniqueRespiration[] = [
  {
    cle: 'coherence',
    nom: 'Cohérence cardiaque',
    description: '5 s inspire, 5 s expire : 6 respirations par minute.',
    phases: [
      { consigne: 'Inspire…', secondes: 5, vers: 1 },
      { consigne: 'Expire…', secondes: 5, vers: 0.6 },
    ],
  },
  {
    cle: 'soupir',
    nom: 'Soupir cyclique',
    description: 'Deux inspirations par le nez, puis une longue expiration par la bouche.',
    phases: [
      { consigne: 'Inspire…', secondes: 2, vers: 0.88 },
      { consigne: 'Encore un peu…', secondes: 1, vers: 1 },
      { consigne: 'Expire lentement…', secondes: 6, vers: 0.6 },
    ],
  },
  {
    cle: 'expiration',
    nom: 'Expiration longue',
    description: '4 s inspire, 6 s expire, sans pause.',
    phases: [
      { consigne: 'Inspire…', secondes: 4, vers: 1 },
      { consigne: 'Expire…', secondes: 6, vers: 0.6 },
    ],
  },
  {
    cle: 'carree',
    nom: 'Respiration carrée',
    description: 'Inspire, bloque, expire, bloque : 4 s chacun.',
    phases: [
      { consigne: 'Inspire…', secondes: 4, vers: 1 },
      { consigne: 'Bloque…', secondes: 4, vers: null },
      { consigne: 'Expire…', secondes: 4, vers: 0.6 },
      { consigne: 'Bloque…', secondes: 4, vers: null },
    ],
  },
];

export const technique = (cle: string | undefined): TechniqueRespiration | undefined =>
  TECHNIQUES.find((t) => t.cle === normaliserTechnique(cle));

/** Les SOS d'avant le choix de technique enregistraient « respiration » : c'était la cohérence cardiaque. */
export function normaliserTechnique(cle: string | undefined): CleTechnique | undefined {
  if (cle === 'respiration') return 'coherence';
  return TECHNIQUES.some((t) => t.cle === cle) ? (cle as CleTechnique) : undefined;
}

/** Consigne en cours après `ms` millisecondes (le cycle se répète). */
export function phaseA(t: TechniqueRespiration, ms: number): PhaseRespiration {
  const cycle = t.phases.reduce((s, p) => s + p.secondes, 0) * 1000;
  let reste = ms % cycle;
  for (const p of t.phases) {
    if (reste < p.secondes * 1000) return p;
    reste -= p.secondes * 1000;
  }
  return t.phases[0]!;
}

export interface BilanTechnique {
  cle: CleTechnique;
  nom: string;
  /** SOS terminés par « l'envie est passée ». */
  resistees: number;
  /** SOS fermés sans « l'envie est passée ». */
  sansIssue: number;
}

/** Bilan par technique, la plus efficace d'abord (résistées, puis taux de réussite). */
export function bilanTechniques(
  resistees: readonly { strategie?: string }[],
  signalees: readonly { technique?: string }[],
): BilanTechnique[] {
  const m = new Map<CleTechnique, BilanTechnique>();
  const ligne = (cle: CleTechnique) => {
    if (!m.has(cle)) m.set(cle, { cle, nom: technique(cle)!.nom, resistees: 0, sansIssue: 0 });
    return m.get(cle)!;
  };
  for (const r of resistees) {
    const cle = normaliserTechnique(r.strategie);
    if (cle) ligne(cle).resistees++;
  }
  for (const s of signalees) {
    const cle = normaliserTechnique(s.technique);
    if (cle) ligne(cle).sansIssue++;
  }
  const taux = (b: BilanTechnique) => b.resistees / (b.resistees + b.sansIssue);
  return [...m.values()].sort((a, b) => b.resistees - a.resistees || taux(b) - taux(a));
}

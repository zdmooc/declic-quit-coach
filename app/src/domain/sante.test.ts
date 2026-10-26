import { describe, expect, it } from 'vitest';
import { classerAliments, objectifsActifs, statutValeur, suiviBiologique } from './sante';

// Valeurs fictives (données de test synthétiques).
const bilans = [
  { id: 'a', date: '2026-01-10', valeurs: { ldl: 1.7, ct: 2.3, hdl: 0.45, b12: 280, tg: 0.9 } },
  { id: 'b', date: '2026-03-10', valeurs: { ldl: 1.4, ct: 2.05, hdl: 0.47, b12: 260, tg: 0.8 } },
];

describe('suivi biologique', () => {
  it('statuts : hors norme, proche d’une limite, seuil de vigilance', () => {
    expect(statutValeur(1.7, { max: 1.6 })).toBe('haut');
    expect(statutValeur(1.4, { max: 1.6 })).toBe('proche-haut');
    expect(statutValeur(1.0, { max: 1.6 })).toBe('normal');
    expect(statutValeur(0.35, { min: 0.4 })).toBe('bas');
    expect(statutValeur(260, { min: 200 }, 300)).toBe('proche-bas');
  });

  it('courbe par paramètre, non-HDL calculé, évolution, norme du médecin prioritaire', () => {
    const s = suiviBiologique(bilans, {});
    const ldl = s.find((x) => x.parametre.cle === 'ldl')!;
    expect(ldl.points.map((p) => p.valeur)).toEqual([1.7, 1.4]);
    expect(ldl.evolution).toBeCloseTo(-17.6, 1);
    expect(s.find((x) => x.parametre.cle === 'nonhdl')!.points.map((p) => p.valeur)).toEqual([1.85, 1.58]);
    const objectif = suiviBiologique(bilans, { ldl: { max: 0.7 } }).find((x) => x.parametre.cle === 'ldl')!;
    expect(objectif.derniere!.statut).toBe('haut');
  });

  it('règle stricte : un aliment qui aggrave UNE anomalie active est à éliminer', () => {
    const actifs = objectifsActifs(suiviBiologique(bilans, {})).map((o) => o.objectif);
    expect(actifs).toEqual(expect.arrayContaining(['ldl', 'b12']));
    const c = classerAliments(actifs);
    const noms = (xs: typeof c.privilegier) => xs.map((x) => x.aliment.nom);
    expect(noms(c.privilegier)).toEqual(expect.arrayContaining(['Sardine, maquereau, hareng', 'Moules, palourdes, huîtres', 'Flocons et son d’avoine']));
    expect(noms(c.eliminer)).toEqual(expect.arrayContaining(['Foie, abats', 'Fromages affinés', 'Œufs', 'Crevettes']));
    expect(c.eliminer.find((x) => x.aliment.nom === 'Foie, abats')).toMatchObject({ aide: ['b12'], aggrave: ['ldl'] });
  });
});

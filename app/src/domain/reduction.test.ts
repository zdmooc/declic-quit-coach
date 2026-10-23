import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { addDays } from './time';
import {
  dateDuZero,
  MOINS_UN_PAR_JOUR,
  MOINS_UN_PAR_SEMAINE,
  MOINS_UN_TOUS_LES_2_JOURS,
  proposerPalier,
  quotaDuJour,
  quotas,
  type PlanInput,
} from './reduction';

const DEBUT = '2026-11-01';
const plan = (over: Partial<PlanInput> = {}): PlanInput => ({
  initial: 20,
  dateDebut: DEBUT,
  rythmes: [{ aPartirDu: DEBUT, strategie: MOINS_UN_PAR_JOUR }],
  paliers: [],
  ...over,
});

describe('plan de réduction', () => {
  it('−1 par jour : 20 au jour 0, 19 au jour 1, 0 au jour 20', () => {
    expect(quotaDuJour(plan(), DEBUT)).toBe(20);
    expect(quotaDuJour(plan(), addDays(DEBUT, 1))).toBe(19);
    expect(quotaDuJour(plan(), addDays(DEBUT, 19))).toBe(1);
    expect(quotaDuJour(plan(), addDays(DEBUT, 20))).toBe(0);
    expect(quotaDuJour(plan(), addDays(DEBUT, 400))).toBe(0);
    expect(dateDuZero(plan())).toBe(addDays(DEBUT, 20));
  });

  it('avant le début du plan, le quota est la consommation initiale', () => {
    expect(quotaDuJour(plan(), addDays(DEBUT, -3))).toBe(20);
  });

  it('un palier garde le quota de la veille et décale la date du zéro', () => {
    const p = plan({ paliers: [addDays(DEBUT, 5)] });
    expect(quotaDuJour(p, addDays(DEBUT, 4))).toBe(16);
    expect(quotaDuJour(p, addDays(DEBUT, 5))).toBe(16);
    expect(quotaDuJour(p, addDays(DEBUT, 6))).toBe(15);
    expect(dateDuZero(p)).toBe(addDays(DEBUT, 21));
  });

  it('−1 tous les 2 jours et −1 par semaine', () => {
    const deux = plan({ rythmes: [{ aPartirDu: DEBUT, strategie: MOINS_UN_TOUS_LES_2_JOURS }] });
    expect(quotaDuJour(deux, addDays(DEBUT, 1))).toBe(20);
    expect(quotaDuJour(deux, addDays(DEBUT, 2))).toBe(19);
    const semaine = plan({ rythmes: [{ aPartirDu: DEBUT, strategie: MOINS_UN_PAR_SEMAINE }] });
    expect(quotaDuJour(semaine, addDays(DEBUT, 6))).toBe(20);
    expect(quotaDuJour(semaine, addDays(DEBUT, 7))).toBe(19);
    expect(dateDuZero(semaine)).toBe(addDays(DEBUT, 140));
  });

  it('un changement de rythme repart du quota courant', () => {
    const p = plan({
      rythmes: [
        { aPartirDu: DEBUT, strategie: MOINS_UN_PAR_JOUR },
        { aPartirDu: addDays(DEBUT, 10), strategie: MOINS_UN_PAR_SEMAINE },
      ],
    });
    expect(quotaDuJour(p, addDays(DEBUT, 9))).toBe(11);
    expect(quotaDuJour(p, addDays(DEBUT, 10))).toBe(11);
    expect(quotaDuJour(p, addDays(DEBUT, 16))).toBe(11);
    expect(quotaDuJour(p, addDays(DEBUT, 17))).toBe(10);
  });

  it('propose un palier seulement en cas de dépassement (RM-04)', () => {
    expect(proposerPalier(15, 14)).toBe(true);
    expect(proposerPalier(14, 14)).toBe(false);
  });

  it('propriétés : le quota ne remonte jamais, reste entre 0 et n, un palier = quota de la veille', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 60 }),
        fc.constantFrom(MOINS_UN_PAR_JOUR, MOINS_UN_TOUS_LES_2_JOURS, MOINS_UN_PAR_SEMAINE),
        fc.uniqueArray(fc.integer({ min: 1, max: 120 }), { maxLength: 15 }),
        (n, strategie, offsets) => {
          const paliers = offsets.map((o) => addDays(DEBUT, o));
          const p = plan({ initial: n, rythmes: [{ aPartirDu: DEBUT, strategie }], paliers });
          const serie = [...quotas(p, addDays(DEBUT, 120)).entries()];
          for (let i = 0; i < serie.length; i++) {
            const [jour, q] = serie[i]!;
            expect(q).toBeGreaterThanOrEqual(0);
            expect(q).toBeLessThanOrEqual(n);
            if (i > 0) {
              const prev = serie[i - 1]![1];
              expect(q).toBeLessThanOrEqual(prev);
              if (paliers.includes(jour)) expect(q).toBe(prev);
            }
          }
        },
      ),
    );
  });
});

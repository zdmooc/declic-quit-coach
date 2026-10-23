import { describe, expect, it } from 'vitest';
import { addMinutes } from './time';
import { jalonsAtteints, paliersFranchis, prochainsJalons, type ContenuSante } from './milestones';

// Contenu fictif pour les tests (le vrai contenu est dans config/health-milestones.json).
const CONTENU: ContenuSante = {
  version: 'test',
  validePar: null,
  jalons: [
    { id: 'a', heures: 1, message: 'A' },
    { id: 'b', heures: 24, message: 'B' },
    { id: 'c', heures: 48, message: 'C' },
  ],
};

describe('jalons', () => {
  const t0 = Date.parse('2026-11-02T08:00:00Z');

  it('jalons santé atteints et à venir', () => {
    const maintenant = addMinutes(t0, 30 * 60);
    expect(jalonsAtteints(CONTENU, t0, maintenant).map((j) => j.id)).toEqual(['a', 'b']);
    expect(prochainsJalons(CONTENU, t0, maintenant).map((j) => j.id)).toEqual(['c']);
  });

  it('paliers d\'économies franchis', () => {
    expect(paliersFranchis(900, 1_050)).toEqual([1_000]);
    expect(paliersFranchis(1_000, 1_500)).toEqual([]);
    expect(paliersFranchis(4_000, 11_000)).toEqual([5_000, 10_000]);
  });
});

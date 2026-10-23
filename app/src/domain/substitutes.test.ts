import { describe, expect, it } from 'vitest';
import { addMinutes } from './time';
import { estValidee, etatOral, etatPatch, type ReferencePharma } from './substitutes';

const BROUILLON: ReferencePharma = {
  version: '0.0.0',
  validePar: null,
  valideLe: null,
  oraux: [{ forme: 'pastille', maxParJour: 10 }],
};
// Valeurs fictives réservées aux tests : ce ne sont PAS des données pharmacologiques.
const VALIDEE_TEST: ReferencePharma = { ...BROUILLON, validePar: 'Test', valideLe: '2026-10-23' };

describe('substituts', () => {
  it('patch 16 h : temps restant puis rappel de retrait', () => {
    const pose = Date.parse('2026-11-02T06:00:00Z');
    expect(etatPatch(null, pose)).toEqual({ statut: 'aucun' });
    expect(etatPatch({ poseLe: pose, dosageMg: 1, dureePortHeures: 16 }, addMinutes(pose, 60))).toMatchObject({
      statut: 'porte',
      resteMinutes: 15 * 60,
    });
    expect(etatPatch({ poseLe: pose, dosageMg: 1, dureePortHeures: 16 }, addMinutes(pose, 16 * 60 + 30))).toMatchObject({
      statut: 'a-retirer',
      retardMinutes: 30,
    });
  });

  it('une table non validée ne donne aucun maximum (ADR-0004)', () => {
    expect(estValidee(BROUILLON)).toBe(false);
    expect(etatOral('pastille', 50, BROUILLON)).toEqual({
      forme: 'pastille',
      prisesAujourdhui: 50,
      maxParJour: null,
      maxAtteint: false,
    });
  });

  it('table validée : maximum atteint (RM-09)', () => {
    expect(etatOral('pastille', 9, VALIDEE_TEST).maxAtteint).toBe(false);
    expect(etatOral('pastille', 10, VALIDEE_TEST).maxAtteint).toBe(true);
    expect(etatOral('gomme', 10, VALIDEE_TEST).maxParJour).toBeNull();
  });
});

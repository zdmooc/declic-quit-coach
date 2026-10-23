import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { addMinutes, awakeWindow } from './time';
import {
  intervalleCibleMinutes,
  intervalleMoyenMinutes,
  plusLonguePauseMinutes,
  prochaineCigarette,
} from './intervals';

const PARIS = 'Europe/Paris';
const fenetre = awakeWindow('2026-11-02', { wake: '07:00', bed: '23:00' }, PARIS); // 16 h

describe('intervalles', () => {
  it('intervalle cible = temps éveillé ÷ quota (RM-02)', () => {
    expect(intervalleCibleMinutes(fenetre, 20)).toBe(48);
    expect(intervalleCibleMinutes(fenetre, 10)).toBe(96);
    expect(intervalleCibleMinutes(fenetre, 0)).toBeNull();
  });

  it('première cigarette possible au lever', () => {
    const r = prochaineCigarette({ maintenant: addMinutes(fenetre.start, -60), fenetre, quota: 20, fumeesAujourdhui: [] });
    expect(r).toEqual({ statut: 'attendre', a: fenetre.start, resteMinutes: 60 });
  });

  it('prochaine = dernière + intervalle (RM-03)', () => {
    const derniere = addMinutes(fenetre.start, 120);
    const r = prochaineCigarette({ maintenant: addMinutes(derniere, 30), fenetre, quota: 20, fumeesAujourdhui: [derniere] });
    expect(r).toEqual({ statut: 'attendre', a: addMinutes(derniere, 48), resteMinutes: 18 });
    const r2 = prochaineCigarette({ maintenant: addMinutes(derniere, 50), fenetre, quota: 20, fumeesAujourdhui: [derniere] });
    expect(r2).toEqual({ statut: 'disponible', depuis: addMinutes(derniere, 48) });
  });

  it('quota atteint et mode arrêt', () => {
    const t = [fenetre.start, addMinutes(fenetre.start, 60)];
    expect(prochaineCigarette({ maintenant: addMinutes(fenetre.start, 90), fenetre, quota: 2, fumeesAujourdhui: t }).statut).toBe(
      'quota-atteint',
    );
    expect(prochaineCigarette({ maintenant: fenetre.start, fenetre, quota: 0, fumeesAujourdhui: [] }).statut).toBe('arret');
  });

  it('intervalle moyen réel', () => {
    expect(intervalleMoyenMinutes([])).toBeNull();
    expect(intervalleMoyenMinutes([0, 60_000 * 40, 60_000 * 100])).toBe(50);
  });

  it('plus longue pause, y compris la pause en cours', () => {
    const t0 = fenetre.start;
    expect(plusLonguePauseMinutes([t0, addMinutes(t0, 30), addMinutes(t0, 200)], addMinutes(t0, 260), t0)).toBe(170);
    expect(plusLonguePauseMinutes([t0], addMinutes(t0, 500), t0)).toBe(500);
    expect(plusLonguePauseMinutes([], addMinutes(t0, 90), t0)).toBe(90);
  });

  it('propriété : la prochaine cigarette n\'est jamais avant le lever ni avant dernière + intervalle', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 40 }),
        fc.array(fc.integer({ min: 0, max: 16 * 60 }), { maxLength: 39 }),
        fc.integer({ min: -120, max: 18 * 60 }),
        (quota, minutes, maintenantMin) => {
          const fumees = minutes.slice(0, quota - 1).map((m) => addMinutes(fenetre.start, m));
          const maintenant = addMinutes(fenetre.start, maintenantMin);
          const r = prochaineCigarette({ maintenant, fenetre, quota, fumeesAujourdhui: fumees });
          const instant = r.statut === 'attendre' ? r.a : r.statut === 'disponible' ? r.depuis : null;
          expect(instant).not.toBeNull();
          expect(instant!).toBeGreaterThanOrEqual(fenetre.start);
          if (fumees.length > 0) {
            expect(instant!).toBeGreaterThanOrEqual(addMinutes(Math.max(...fumees), intervalleCibleMinutes(fenetre, quota)!));
          }
        },
      ),
    );
  });
});

import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { addMinutes, zonedInstant } from './time';
import {
  intervalleCibleMinutes,
  intervalleMoyenMinutes,
  plusLonguePauseMinutes,
  prochaineCigarette,
  respectIntervalle,
} from './intervals';

const t0 = zonedInstant('2026-11-02', '07:30', 'Europe/Paris');

describe('intervalles', () => {
  it('intervalle cible = durée active ÷ (quota − 1) (RM-02)', () => {
    // 15 h entre la première et la dernière cigarette, 16 cigarettes → toutes les heures.
    expect(intervalleCibleMinutes(15 * 60, 16)).toBe(60);
    expect(intervalleCibleMinutes(15 * 60, 2)).toBe(900);
    expect(intervalleCibleMinutes(15 * 60, 1)).toBeNull();
    expect(intervalleCibleMinutes(15 * 60, 0)).toBeNull();
    expect(intervalleCibleMinutes(0, 10)).toBeNull();
  });

  it('la première cigarette de la journée n\'a pas d\'heure imposée', () => {
    expect(prochaineCigarette({ maintenant: t0, quota: 10, fumeesAujourdhui: [], intervalleMinutes: 60 })).toEqual({
      statut: 'disponible',
      depuis: null,
    });
  });

  it('prochaine = dernière + intervalle (RM-03)', () => {
    const r = prochaineCigarette({ maintenant: addMinutes(t0, 30), quota: 16, fumeesAujourdhui: [t0], intervalleMinutes: 60 });
    expect(r).toEqual({ statut: 'attendre', a: addMinutes(t0, 60), resteMinutes: 30 });
    const r2 = prochaineCigarette({ maintenant: addMinutes(t0, 70), quota: 16, fumeesAujourdhui: [t0], intervalleMinutes: 60 });
    expect(r2).toEqual({ statut: 'disponible', depuis: addMinutes(t0, 60) });
  });

  it('quota atteint et mode arrêt', () => {
    expect(prochaineCigarette({ maintenant: t0, quota: 1, fumeesAujourdhui: [t0], intervalleMinutes: null }).statut).toBe(
      'quota-atteint',
    );
    expect(prochaineCigarette({ maintenant: t0, quota: 0, fumeesAujourdhui: [], intervalleMinutes: null }).statut).toBe('arret');
  });

  it('intervalle moyen réel', () => {
    expect(intervalleMoyenMinutes([])).toBeNull();
    expect(intervalleMoyenMinutes([0, 60_000 * 40, 60_000 * 100])).toBe(50);
  });

  it('plus longue pause, y compris la pause en cours', () => {
    expect(plusLonguePauseMinutes([t0, addMinutes(t0, 30), addMinutes(t0, 200)], addMinutes(t0, 260), t0)).toBe(170);
    expect(plusLonguePauseMinutes([t0], addMinutes(t0, 500), t0)).toBe(500);
    expect(plusLonguePauseMinutes([], addMinutes(t0, 90), t0)).toBe(90);
    // Première cigarette 7 h après le début du suivi : la pause de 7 h reste le record.
    expect(plusLonguePauseMinutes([addMinutes(t0, 420)], addMinutes(t0, 421), t0)).toBe(420);
  });

  it('RM-18 : respect de l\'intervalle, la première de la journée ne compte pas', () => {
    const c = [0, 60, 100, 165, 224].map((m) => addMinutes(t0, m)); // écarts : 60, 40, 65, 59
    expect(respectIntervalle(c, 60)).toEqual({ intervalleMinutes: 60, respectees: 3, nonRespectees: 1 });
    expect(respectIntervalle([t0], 60)).toEqual({ intervalleMinutes: 60, respectees: 0, nonRespectees: 0 });
    expect(respectIntervalle(c, null)).toEqual({ intervalleMinutes: null, respectees: 0, nonRespectees: 0 });
  });

  it('propriété : respectées + non respectées = cigarettes − 1', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 16 * 60 }), { minLength: 1, maxLength: 60 }), fc.integer({ min: 1, max: 180 }), (m, i) => {
        const r = respectIntervalle(m.map((x) => addMinutes(t0, x)), i);
        expect(r.respectees + r.nonRespectees).toBe(m.length - 1);
      }),
    );
  });

  it('propriété : la prochaine n\'arrive jamais avant dernière + intervalle', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 40 }),
        fc.array(fc.integer({ min: 0, max: 16 * 60 }), { minLength: 1, maxLength: 39 }),
        fc.integer({ min: 10, max: 240 }),
        fc.integer({ min: 0, max: 18 * 60 }),
        (quota, minutes, intervalle, maintenantMin) => {
          const fumees = minutes.slice(0, quota - 1).map((m) => addMinutes(t0, m));
          const r = prochaineCigarette({ maintenant: addMinutes(t0, maintenantMin), quota, fumeesAujourdhui: fumees, intervalleMinutes: intervalle });
          const instant = r.statut === 'attendre' ? r.a : r.statut === 'disponible' ? r.depuis : null;
          expect(instant).toBe(addMinutes(Math.max(...fumees), intervalle));
        },
      ),
    );
  });
});

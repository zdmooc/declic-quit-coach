import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { etiqueterCigarettes, intervallesEveilles, journeeDe, mediane, moyenne } from './sessions';
import { zonedInstant } from './time';
import { analyser } from './analyse';
import { mesurerHabitudes } from './habitudes';

const TZ = 'Europe/Paris';
const t = (jour: string, heure: string) => zonedInstant(jour, heure, TZ);

describe('journée de fumeur (RM-14)', () => {
  it('un couche-tard : les cigarettes après minuit restent sur la journée de la veille', () => {
    const cigs = [t('2026-11-02', '10:00'), t('2026-11-02', '23:30'), t('2026-11-03', '01:45'), t('2026-11-03', '11:00')];
    expect(etiqueterCigarettes(cigs, TZ)).toEqual(['2026-11-02', '2026-11-02', '2026-11-02', '2026-11-03']);
  });

  it('un lève-tôt : la première cigarette à 5 h ouvre une nouvelle journée', () => {
    const cigs = [t('2026-11-02', '21:00'), t('2026-11-03', '05:10')];
    expect(etiqueterCigarettes(cigs, TZ)).toEqual(['2026-11-02', '2026-11-03']);
  });

  it('une longue pause dans la journée garde la même date', () => {
    const cigs = [t('2026-11-02', '08:00'), t('2026-11-02', '15:00')];
    expect(etiqueterCigarettes(cigs, TZ)).toEqual(['2026-11-02', '2026-11-02']);
  });

  it('journée d\'un instant quelconque', () => {
    const cigs = [{ a: t('2026-11-02', '23:30'), jour: '2026-11-02' }];
    expect(journeeDe(t('2026-11-03', '02:00'), cigs, TZ)).toBe('2026-11-02'); // encore éveillé
    expect(journeeDe(t('2026-11-03', '09:00'), cigs, TZ)).toBe('2026-11-03'); // après la nuit
    expect(journeeDe(t('2026-11-03', '09:00'), [], TZ)).toBe('2026-11-03');
  });

  it('les intervalles excluent la nuit', () => {
    const cigs = [
      { a: t('2026-11-02', '08:00'), jour: '2026-11-02' },
      { a: t('2026-11-02', '08:40'), jour: '2026-11-02' },
      { a: t('2026-11-03', '08:00'), jour: '2026-11-03' },
      { a: t('2026-11-03', '09:00'), jour: '2026-11-03' },
    ];
    expect(intervallesEveilles(cigs)).toEqual([40, 60]);
  });

  it('moyenne et médiane', () => {
    expect(moyenne([])).toBeNull();
    expect(mediane([])).toBeNull();
    expect(mediane([3, 1, 2])).toBe(2);
    expect(mediane([4, 1, 2, 3])).toBe(2.5);
  });

  it('propriété : les étiquettes ne reculent jamais et ne changent qu\'après une pause ≥ 5 h', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 1, max: 12 * 60 }), { minLength: 1, maxLength: 80 }), (ecarts) => {
        let a = t('2026-11-02', '07:00');
        const cigs = ecarts.map((e) => (a += e * 60_000));
        const jours = etiqueterCigarettes(cigs, TZ);
        for (let i = 1; i < jours.length; i++) {
          expect(jours[i]! >= jours[i - 1]!).toBe(true);
          if (ecarts[i]! < 300) expect(jours[i]).toBe(jours[i - 1]);
        }
      }),
    );
  });
});

describe('habitudes mesurées (RM-15, RM-17)', () => {
  // 3 journées : de 7 h 30 à 22 h 30, 16 cigarettes toutes les 60 min ; journée en cours le 5.
  const cigs = ['2026-11-02', '2026-11-03', '2026-11-04'].flatMap((jour) =>
    Array.from({ length: 16 }, (_, i) => ({ a: t(jour, '07:30') + i * 60 * 60_000, jour })),
  );

  it('mesure consommation, horaires, durée active et intervalle sur les journées terminées', () => {
    const encours = [...cigs, { a: t('2026-11-05', '07:00'), jour: '2026-11-05' }];
    expect(mesurerHabitudes(encours, '2026-11-05', TZ)).toEqual({
      joursMesures: 3,
      cigarettesParJour: 16,
      debutHabituel: '07:30',
      finHabituelle: '22:30',
      dureeActiveMinutes: 15 * 60,
      intervalleMoyenMinutes: 60,
    });
  });

  it('ignore la journée en cours et renvoie null sans journée terminée', () => {
    expect(mesurerHabitudes(cigs, '2026-11-02', TZ)).toBeNull();
    expect(mesurerHabitudes(cigs, '2026-11-03', TZ)?.joursMesures).toBe(1);
  });

  it('une dernière cigarette après minuit donne une fin habituelle après minuit', () => {
    const tard = [
      { a: t('2026-11-02', '12:00'), jour: '2026-11-02' },
      { a: t('2026-11-03', '01:30'), jour: '2026-11-02' },
    ];
    expect(mesurerHabitudes(tard, '2026-11-04', TZ)).toMatchObject({ finHabituelle: '01:30', dureeActiveMinutes: 13.5 * 60 });
  });
});

describe('analyse des déclencheurs (RM-16)', () => {
  it('classe les contextes et les heures à risque', () => {
    const a = analyser(
      [
        { a: t('2026-11-02', '08:05'), contexte: 'cafe' },
        { a: t('2026-11-02', '08:40'), contexte: 'cafe' },
        { a: t('2026-11-02', '12:30'), contexte: 'repas' },
        { a: t('2026-11-02', '16:00'), contexte: 'stress' },
        { a: t('2026-11-02', '16:20') },
      ],
      TZ,
    );
    expect(a.cigarettes).toBe(5);
    expect(a.avecContexte).toBe(4);
    expect(a.declencheurs[0]).toEqual({ contexte: 'cafe', nombre: 2, part: 0.5 });
    expect(a.heuresARisque.slice(0, 2)).toEqual([
      { heure: 8, nombre: 2 },
      { heure: 16, nombre: 2 },
    ]);
  });
});

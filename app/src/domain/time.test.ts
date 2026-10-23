import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import {
  addDays,
  awakeWindow,
  daysBetween,
  isoWeekday,
  localDateOf,
  minutesBetween,
  offsetMinutes,
  parseTimeOfDay,
  planDayOf,
  zonedInstant,
} from './time';

const PARIS = 'Europe/Paris';

describe('time', () => {
  it('convertit une heure locale de Paris en instant UTC (été et hiver)', () => {
    expect(new Date(zonedInstant('2026-07-01', '07:00', PARIS)).toISOString()).toBe('2026-07-01T05:00:00.000Z');
    expect(new Date(zonedInstant('2026-12-01', '07:00', PARIS)).toISOString()).toBe('2026-12-01T06:00:00.000Z');
  });

  it('donne le décalage du fuseau', () => {
    expect(offsetMinutes(Date.parse('2026-07-01T12:00:00Z'), PARIS)).toBe(120);
    expect(offsetMinutes(Date.parse('2026-12-01T12:00:00Z'), PARIS)).toBe(60);
  });

  it('calcule le jour local, pas le jour UTC', () => {
    // 23 h 30 UTC = 1 h 30 à Paris le lendemain en été
    expect(localDateOf(Date.parse('2026-07-01T23:30:00Z'), PARIS)).toBe('2026-07-02');
  });

  it('gère le passage à l\'heure d\'hiver : la journée éveillée dure une heure de plus', () => {
    // Nuit du 24 au 25 octobre 2026 : retour à l'heure d'hiver en France.
    const normal = awakeWindow('2026-10-23', { wake: '07:00', bed: '03:00' }, PARIS);
    const long = awakeWindow('2026-10-24', { wake: '07:00', bed: '03:00' }, PARIS);
    expect(minutesBetween(normal.start, normal.end)).toBe(20 * 60);
    expect(minutesBetween(long.start, long.end)).toBe(21 * 60);
  });

  it('rattache une cigarette après minuit à la veille si le coucher est après minuit', () => {
    const h = { wake: '07:00', bed: '01:00' };
    expect(planDayOf(Date.parse('2026-10-22T22:30:00Z'), h, PARIS)).toBe('2026-10-22'); // 00:30 locale
    expect(planDayOf(Date.parse('2026-10-23T04:00:00Z'), h, PARIS)).toBe('2026-10-23'); // 06:00 locale
  });

  it('valide les heures', () => {
    expect(parseTimeOfDay('23:59')).toBe(1439);
    expect(() => parseTimeOfDay('24:00')).toThrow();
    expect(() => parseTimeOfDay('7h')).toThrow();
  });

  it('jour de la semaine ISO', () => {
    expect(isoWeekday('2026-10-23')).toBe(5); // vendredi
    expect(isoWeekday('2026-10-25')).toBe(7); // dimanche
  });

  it('addDays et daysBetween sont réciproques', () => {
    fc.assert(
      fc.property(fc.integer({ min: -2000, max: 2000 }), (n) => {
        expect(daysBetween('2026-10-23', addDays('2026-10-23', n))).toBe(n);
      }),
    );
  });

  it('zonedInstant puis localDateOf retombe sur la même date', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 3650 }),
        fc.integer({ min: 0, max: 23 }),
        fc.constantFrom(PARIS, 'America/Montreal', 'Asia/Tokyo', 'UTC'),
        (n, h, tz) => {
          const date = addDays('2026-01-01', n);
          const heure = `${String(h).padStart(2, '0')}:30`;
          expect(localDateOf(zonedInstant(date, heure, tz), tz)).toBe(date);
        },
      ),
    );
  });
});

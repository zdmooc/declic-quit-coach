import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { localDateOf, zonedInstant } from './time';
import { planifier, PREFERENCES_PAR_DEFAUT, type Candidate, type CategorieNotif } from './notifications';

const TZ = 'Europe/Paris';
const MAINTENANT = zonedInstant('2026-11-02', '08:00', TZ);
const a = (heure: string, jour = '2026-11-02') => zonedInstant(jour, heure, TZ);

const cand = (cle: string, at: number, categorie: CategorieNotif, extra: Partial<Candidate> = {}): Candidate => ({
  cle,
  a: at,
  categorie,
  critique: false,
  titre: cle,
  corps: cle,
  ...extra,
});

describe('planificateur de notifications', () => {
  it('plafonne à 4 non critiques par jour en gardant les plus prioritaires', () => {
    const c = [
      cand('bilan', a('18:00'), 'bilan'),
      cand('eco', a('12:00'), 'economies'),
      cand('sante', a('13:00'), 'sante'),
      cand('rythme', a('14:00'), 'rythme'),
      cand('plan', a('15:00'), 'plan'),
      cand('patch', a('16:00'), 'substitut', { critique: true }),
    ];
    const r = planifier(c, PREFERENCES_PAR_DEFAUT, MAINTENANT, TZ).map((x) => x.cle);
    expect(r).toEqual(['eco', 'sante', 'rythme', 'plan', 'patch']);
  });

  it('heures calmes : supprime une notification non reportable, décale une reportable, garde une critique', () => {
    const c = [
      cand('rythme-nuit', a('23:30'), 'rythme'),
      cand('eco-nuit', a('23:45'), 'economies', { reportable: true }),
      cand('patch-nuit', a('23:50'), 'substitut', { critique: true }),
    ];
    const r = planifier(c, PREFERENCES_PAR_DEFAUT, MAINTENANT, TZ);
    expect(r.map((x) => x.cle)).toEqual(['patch-nuit', 'eco-nuit']);
    expect(r[1]!.a).toBe(a('07:30', '2026-11-03'));
  });

  it('ignore le passé, l\'au-delà de l\'horizon et les catégories désactivées', () => {
    const c = [
      cand('passe', a('07:00'), 'plan'),
      cand('loin', a('09:00', '2026-11-05'), 'plan'),
      cand('bilan', a('19:00'), 'bilan'),
    ];
    const prefs = { ...PREFERENCES_PAR_DEFAUT, categories: { ...PREFERENCES_PAR_DEFAUT.categories, bilan: false } };
    expect(planifier(c, prefs, MAINTENANT, TZ)).toEqual([]);
  });

  it('dédoublonne par clé en gardant la plus proche', () => {
    const c = [cand('x', a('12:00'), 'plan'), cand('x', a('10:00'), 'plan')];
    const r = planifier(c, PREFERENCES_PAR_DEFAUT, MAINTENANT, TZ);
    expect(r).toHaveLength(1);
    expect(r[0]!.a).toBe(a('10:00'));
  });

  it('propriétés : trié, dans l\'horizon, ≤ 64, au plus 4 non critiques par jour, aucune non critique la nuit', () => {
    const categories: CategorieNotif[] = ['substitut', 'plan', 'rythme', 'sante', 'economies', 'bilan'];
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            minutes: fc.integer({ min: -600, max: 4 * 24 * 60 }),
            cat: fc.constantFrom(...categories),
            critique: fc.boolean(),
            reportable: fc.boolean(),
          }),
          { maxLength: 200 },
        ),
        (specs) => {
          const c = specs.map((s, i) =>
            cand(`k${i}`, MAINTENANT + s.minutes * 60_000, s.cat, { critique: s.critique, reportable: s.reportable }),
          );
          const r = planifier(c, PREFERENCES_PAR_DEFAUT, MAINTENANT, TZ);
          expect(r.length).toBeLessThanOrEqual(64);
          const parJour = new Map<string, number>();
          for (let i = 0; i < r.length; i++) {
            const x = r[i]!;
            if (i > 0) expect(x.a).toBeGreaterThanOrEqual(r[i - 1]!.a);
            expect(x.a).toBeGreaterThan(MAINTENANT);
            expect(x.a).toBeLessThanOrEqual(MAINTENANT + 48 * 3_600_000);
            if (!x.critique) {
              const jour = localDateOf(x.a, TZ);
              parJour.set(jour, (parJour.get(jour) ?? 0) + 1);
              const heure = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(x.a);
              expect(heure >= '07:30' && heure < '22:30').toBe(true);
            }
          }
          for (const n of parJour.values()) expect(n).toBeLessThanOrEqual(4);
        },
      ),
    );
  });
});

import { describe, expect, it } from 'vitest';
import { analyserMontre, MONTRE_VIDE } from './montre';
import { zonedInstant } from './time';
import type { EtatJournal } from './dashboard';

const TZ = 'Europe/Paris';
const h = (j: string, hh: string) => zonedInstant(j, hh, TZ);

describe('montre (Health Connect)', () => {
  it('réveil, délai jusqu’à la 1re cigarette, effet d’une cigarette sur le cœur, glycémie', () => {
    const etat = { cigarettes: [{ id: 'c1', a: h('2026-10-27', '07:30'), jour: '2026-10-27' }] } as unknown as EtatJournal;
    const d = {
      ...MONTRE_VIDE(h('2026-10-27', '12:00')),
      sommeils: [{ debut: h('2026-10-26', '23:30'), fin: h('2026-10-27', '07:00') }],
      frequence: [
        { a: h('2026-10-27', '07:10'), bpm: 70 },
        { a: h('2026-10-27', '07:20'), bpm: 72 },
        { a: h('2026-10-27', '07:40'), bpm: 84 },
      ],
      repos: [{ a: h('2026-10-27', '06:00'), bpm: 64 }],
      glucose: [
        { a: h('2026-10-27', '08:00'), mgdl: 100 },
        { a: h('2026-10-27', '09:00'), mgdl: 140 },
      ],
    };
    const m = analyserMontre(etat, d, '2026-10-27', TZ, 3);
    const j = m.jours.at(-1)!;
    expect(j).toMatchObject({ sommeilMinutes: 450, delaiPremiereMinutes: 30, frequenceRepos: 64, glucose: { moyenne: 120, min: 100, max: 140 } });
    expect(m.effetCigarette).toEqual({ avant: 71, apres: 84, cigarettes: 1 });
    expect(m.sources).toEqual(['sommeil', 'fréquence cardiaque', 'fréquence au repos', 'glycémie']);
  });
});

describe('sommeil réparateur et pistes', () => {
  it('profond + paradoxal, cigarette et café avant le coucher, pistes tirées des nuits', async () => {
    const { pistesSommeil } = await import('./montre');
    const jours = ['2026-10-25', '2026-10-26', '2026-10-27'];
    const cigarettes = jours.map((j, i) => ({ id: `c${i}`, a: h(addJ(j, -1), '22:50'), jour: addJ(j, -1) }));
    const boissons = jours.map((j, i) => ({ id: `b${i}`, a: h(addJ(j, -1), '18:00'), jour: addJ(j, -1), boisson: 'cafe' }));
    const etat = { cigarettes, boissons } as unknown as EtatJournal;
    const d = {
      ...MONTRE_VIDE(h('2026-10-27', '12:00')),
      sommeils: jours.map((j) => ({
        debut: h(addJ(j, -1), '23:20'),
        fin: h(j, '07:20'),
        phases: { profond: 90, paradoxal: 100, leger: 250, eveil: 40 },
      })),
    };
    const m = analyserMontre(etat, d, '2026-10-27', TZ, 3);
    const j = m.jours.at(-1)!;
    expect(j).toMatchObject({ reparateurMinutes: 190, cigaretteAvantCoucher: 30, cafeAvantCoucher: 320 });
    expect(j.reparateurPct).toBeCloseTo((190 / 440) * 100);
    const titres = pistesSommeil(m.jours, TZ).map((p) => p.titre);
    expect(titres).toEqual(['Dernière cigarette au moins 1 h 30 avant de dormir', 'Pas de caféine dans les 8 h avant le coucher', 'Moins d’éveils dans la nuit']);
  });
});

function addJ(j: string, n: number): string {
  const d = new Date(`${j}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

describe('sommeil réparateur par semaine', () => {
  it('moyenne par semaine (lundi) et verdict vert / orange / rouge', async () => {
    const { semainesReparateur } = await import('./montre');
    const j = (jour: string, pct: number) => ({ jour, reparateurPct: pct, reparateurMinutes: pct * 4 }) as never;
    const s = semainesReparateur([j('2026-10-19', 28), j('2026-10-21', 30), j('2026-10-26', 40), j('2026-10-27', 38)]);
    expect(s.map((w) => [w.lundi, Math.round(w.pct), w.verdict])).toEqual([
      ['2026-10-19', 29, 'ameliorer'],
      ['2026-10-26', 39, 'bien'],
    ]);
  });
});

describe('réveils nocturnes (RM-31)', () => {
  it('réveils ≥ 5 min entre endormissement et réveil final, temps éveillé, cigarette de nuit, heures, semaines', async () => {
    const { semainesReveils, heuresReveils } = await import('./montre');
    const S = (debut: string, fin: string, phase: 'profond' | 'paradoxal' | 'leger' | 'eveil', j1 = '2026-10-29', j2 = j1) => ({ debut: h(j1, debut), fin: h(j2, fin), phase });
    const segments = [
      S('23:00', '23:20', 'eveil', '2026-10-29'), // avant l'endormissement : non compté
      S('23:20', '23:59', 'leger', '2026-10-29'),
      { debut: h('2026-10-29', '23:59'), fin: h('2026-10-30', '03:00'), phase: 'profond' as const },
      S('03:00', '03:12', 'eveil', '2026-10-30'), // réveil de 12 min
      S('03:12', '05:00', 'paradoxal', '2026-10-30'),
      S('05:00', '05:03', 'eveil', '2026-10-30'), // micro-réveil : temps éveillé, pas un réveil
      S('05:03', '07:00', 'leger', '2026-10-30'),
      S('07:00', '07:30', 'eveil', '2026-10-30'), // après le réveil final : non compté
    ];
    const etat = { cigarettes: [{ id: 'n', a: h('2026-10-30', '03:05'), jour: '2026-10-29' }] } as unknown as EtatJournal;
    const d = {
      ...MONTRE_VIDE(h('2026-10-30', '12:00')),
      sommeils: [{ debut: h('2026-10-29', '23:00'), fin: h('2026-10-30', '07:30'), phases: { profond: 181, paradoxal: 108, leger: 156, eveil: 65 }, segments }],
    };
    const m = analyserMontre(etat, d, '2026-10-30', TZ, 3);
    const nuit = m.jours.at(-1)!;
    expect(nuit.reveils!.map((r) => r.fin - r.debut)).toEqual([12 * 60_000]);
    expect(nuit.eveilMinutes).toBe(15);
    expect(nuit.cigarettesNuit).toBe(1);
    expect(heuresReveils(m.jours, TZ).find((x) => x.heure === 3)!.nombre).toBe(1);
    expect(semainesReveils(m.jours)).toEqual([{ lundi: '2026-10-26', nuits: 1, reveils: 1, eveilMinutes: 15, verdict: 'bien' }]);
  });
});

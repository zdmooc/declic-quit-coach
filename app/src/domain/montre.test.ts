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

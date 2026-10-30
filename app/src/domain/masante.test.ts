import { describe, expect, it } from 'vitest';
import { maSante } from './masante';
import type { AnalyseMontre } from './montre';
import type { Statistiques } from './stats';
import type { TableauDeBord } from './dashboard';

const jour = (j: string, x: Partial<AnalyseMontre['jours'][number]>) =>
  ({ jour: j, reveil: null, sommeilMinutes: null, coucher: null, phases: null, reparateurMinutes: null, reparateurPct: null, cigaretteAvantCoucher: null, cafeAvantCoucher: null, delaiPremiereMinutes: null, premiereAvantReveil: false, premiere: null, reveils: null, eveilMinutes: null, cigarettesNuit: 0, segments: null, frequenceRepos: null, hrvMs: null, pas: null, spo2: null, glucose: null, ...x });

describe('Ma santé', () => {
  it('verdicts par axe : cigarettes en baisse, réveil → cigarette (Fagerström), café → cigarette, bilans', () => {
    const dates = Array.from({ length: 14 }, (_, i) => `2026-10-${String(15 + i).padStart(2, '0')}`);
    const stats = { parJour: dates.map((j, i) => ({ jour: j, valeur: i < 7 ? 20 : 15 })) } as unknown as Statistiques;
    const montre = { jours: dates.map((j) => jour(j, { delaiPremiereMinutes: 20, sommeilMinutes: 480, pas: 9000 })) } as unknown as AnalyseMontre;
    const tdb = { cafeine: { totalSept: 4, suiviesDeCigarette: 3, quota: null, parJour: [{ jour: '2026-10-28', boissons: 4, mg: 320 }] } } as unknown as TableauDeBord;
    const axes = maSante({ aujourdhui: '2026-10-28', tdb, stats, montre, anomalies: ['LDL', 'CRP'] });
    const par = Object.fromEntries(axes.map((a) => [a.cle, a]));
    expect(par.cigarettes).toMatchObject({ valeur: '15', couleur: 'vert', evolution: '↓ 5', progres: true });
    expect(par.reveil).toMatchObject({ valeur: '20 min', couleur: 'rouge' });
    expect(par['cafe-cigarette']).toMatchObject({ valeur: '3 / 4', couleur: 'rouge' });
    expect(par.cafeine).toMatchObject({ couleur: 'ambre' });
    expect(par.sommeil!.couleur).toBe('vert');
    expect(par.pas!.couleur).toBe('vert');
    expect(par.bilans).toMatchObject({ valeur: '2 à suivre', couleur: 'rouge', evolution: 'LDL, CRP' });
  });
});

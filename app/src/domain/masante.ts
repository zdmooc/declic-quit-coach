/**
 * « Ma santé » (RM-29) : chaque axe d'un coup d'œil, semaine en cours (7 derniers jours) comparée
 * à la précédente, avec un verdict vert / orange / rouge. Projection pure, aucun calcul médical :
 * seuils indicatifs (tabac : délai réveil → 1re cigarette du test de Fagerström ; caféine : repère
 * EFSA 400 mg ; pas : repère courant 8 000 ; sommeil : 7 h et réparateur ≥ 35 %).
 */

import type { TableauDeBord } from './dashboard';
import type { AnalyseMontre, JourMontre } from './montre';
import { semainesReparateur } from './montre';
import type { Statistiques } from './stats';
import { addDays, daysBetween, type LocalDate } from './time';

export type Couleur = 'vert' | 'ambre' | 'rouge' | 'neutre';
export type Destination = 'stats' | 'montre' | 'cafeine' | 'bilans';

export interface Axe {
  cle: string;
  titre: string;
  valeur: string;
  couleur: Couleur;
  /** Par rapport à la semaine précédente, ex. « ↓ 3 ». */
  evolution: string | null;
  /** Évolution dans le bon sens ? (`null` : pas de comparaison). */
  progres: boolean | null;
  aller: Destination;
}

const moy = (xs: readonly number[]) => (xs.length === 0 ? null : xs.reduce((s, x) => s + x, 0) / xs.length);
const duree = (m: number) => (m < 60 ? `${Math.round(m)} min` : `${Math.floor(m / 60)} h ${String(Math.round(m % 60)).padStart(2, '0')}`);
const un = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');

/** Valeurs des 7 derniers jours et des 7 précédents. */
function deuxSemaines<T extends { jour: LocalDate }>(xs: readonly T[], valeur: (x: T) => number | null, aujourdhui: LocalDate) {
  const age = (j: LocalDate) => daysBetween(j, aujourdhui);
  const pick = (min: number, max: number) =>
    xs.filter((x) => age(x.jour) >= min && age(x.jour) <= max).map(valeur).filter((v): v is number => v !== null);
  return { cette: moy(pick(0, 6)), avant: moy(pick(7, 13)) };
}

function evolution(cette: number, avant: number | null, format: (n: number) => string, bonSens: 'bas' | 'haut', seuil = 0.03) {
  if (avant === null || avant === 0) return { evolution: null, progres: null };
  const r = (cette - avant) / avant;
  if (Math.abs(r) < seuil) return { evolution: '= stable', progres: null };
  return { evolution: `${cette < avant ? '↓' : '↑'} ${format(Math.abs(cette - avant))}`, progres: bonSens === 'bas' ? cette < avant : cette > avant };
}

export function maSante(p: {
  aujourdhui: LocalDate;
  tdb: TableauDeBord;
  stats: Statistiques;
  montre: AnalyseMontre | null;
  /** Noms des paramètres hors norme ou à surveiller au dernier bilan. */
  anomalies: string[];
}): Axe[] {
  const { aujourdhui, tdb, stats, montre } = p;
  const axes: Axe[] = [];

  // Tabac : cigarettes par jour (journées notées).
  const cig = deuxSemaines(stats.parJour, (x) => x.valeur, aujourdhui);
  if (cig.cette !== null) {
    const e = evolution(cig.cette, cig.avant, un, 'bas', 0.1);
    axes.push({ cle: 'cigarettes', titre: '🚬 Cigarettes / jour', valeur: un(cig.cette), couleur: e.progres === null ? 'ambre' : e.progres ? 'vert' : 'rouge', ...e, aller: 'stats' });
  }

  // Maximum par jour (RM-30) : jours tenus sur les 7 derniers jours terminés du plan.
  if (stats.maximum)
    axes.push({
      cle: 'maximum',
      titre: '🎯 Jours sous le maximum',
      valeur: `${stats.maximum.tenus} / ${stats.maximum.jours}`,
      couleur: stats.maximum.tenus / stats.maximum.jours >= 0.85 ? 'vert' : stats.maximum.tenus / stats.maximum.jours >= 0.6 ? 'ambre' : 'rouge',
      evolution: tdb.quota !== null ? `max ${tdb.quota} / jour` : null,
      progres: null,
      aller: 'stats',
    });

  const jm: JourMontre[] = montre?.jours ?? [];
  // Réveil → 1re cigarette : > 60 min faible dépendance, 31–60 modérée, ≤ 30 forte (Fagerström).
  const delai = deuxSemaines(jm, (j) => j.delaiPremiereMinutes, aujourdhui);
  if (delai.cette !== null)
    axes.push({
      cle: 'reveil',
      titre: '⏱ Réveil → 1re cigarette',
      valeur: duree(delai.cette),
      couleur: delai.cette > 60 ? 'vert' : delai.cette > 30 ? 'ambre' : 'rouge',
      ...evolution(delai.cette, delai.avant, duree, 'haut'),
      aller: 'montre',
    });

  // Café → cigarette : part des boissons caféinées suivies d'une cigarette dans les 20 min.
  const c = tdb.cafeine;
  if (c.totalSept > 0) {
    const part = (c.suiviesDeCigarette / c.totalSept) * 100;
    axes.push({
      cle: 'cafe-cigarette',
      titre: '☕→🚬 Café suivi d’une cigarette',
      valeur: `${c.suiviesDeCigarette} / ${c.totalSept}`,
      couleur: part < 25 ? 'vert' : part < 50 ? 'ambre' : 'rouge',
      evolution: `${Math.round(part)} %`,
      progres: null,
      aller: 'cafeine',
    });
    const jours = c.parJour.filter((j) => j.boissons > 0);
    const mg = moy(jours.map((j) => j.mg))!;
    const parJour = moy(jours.map((j) => j.boissons))!;
    const couleur: Couleur = c.quota !== null ? (parJour <= c.quota ? 'vert' : 'rouge') : mg < 300 ? 'vert' : mg <= 400 ? 'ambre' : 'rouge';
    axes.push({ cle: 'cafeine', titre: '☕ Caféine / jour', valeur: `${un(parJour)} · ${Math.round(mg)} mg`, couleur, evolution: c.quota !== null ? `palier ${c.quota}` : null, progres: null, aller: 'cafeine' });
  }

  // Sommeil réparateur : verdict de la semaine en cours.
  const sem = semainesReparateur(jm);
  const s = sem.at(-1);
  if (s) {
    const prec = sem.at(-2) && daysBetween(sem.at(-2)!.lundi, s.lundi) === 7 ? sem.at(-2)!.pct : null;
    axes.push({
      cle: 'reparateur',
      titre: '😴 Sommeil réparateur',
      valeur: `${Math.round(s.pct)} %`,
      couleur: s.verdict === 'bien' ? 'vert' : s.verdict === 'limite' ? 'ambre' : 'rouge',
      ...evolution(s.pct, prec, (n) => `${Math.round(n)} pts`, 'haut'),
      aller: 'montre',
    });
  }
  const dodo = deuxSemaines(jm, (j) => j.sommeilMinutes, aujourdhui);
  if (dodo.cette !== null)
    axes.push({
      cle: 'sommeil',
      titre: '🛏 Durée du sommeil',
      valeur: duree(dodo.cette),
      couleur: dodo.cette >= 7 * 60 ? 'vert' : dodo.cette >= 6 * 60 ? 'ambre' : 'rouge',
      ...evolution(dodo.cette, dodo.avant, duree, 'haut'),
      aller: 'montre',
    });

  const repos = deuxSemaines(jm, (j) => j.frequenceRepos, aujourdhui);
  if (repos.cette !== null) {
    const e = evolution(repos.cette, repos.avant, (n) => `${Math.round(n)} bpm`, 'bas');
    const hausse = repos.avant === null ? 0 : repos.cette - repos.avant;
    axes.push({ cle: 'repos', titre: '💓 Cœur au repos', valeur: `${Math.round(repos.cette)} bpm`, couleur: hausse <= 1 ? 'vert' : hausse <= 3 ? 'ambre' : 'rouge', ...e, aller: 'montre' });
  }

  const hrv = deuxSemaines(jm, (j) => j.hrvMs, aujourdhui);
  if (hrv.cette !== null) {
    const r = hrv.avant ? (hrv.cette - hrv.avant) / hrv.avant : 0;
    axes.push({
      cle: 'hrv',
      titre: '🧘 HRV (stress)',
      valeur: `${Math.round(hrv.cette)} ms`,
      couleur: r >= -0.05 ? 'vert' : r >= -0.15 ? 'ambre' : 'rouge',
      ...evolution(hrv.cette, hrv.avant, (n) => `${Math.round(n)} ms`, 'haut'),
      aller: 'montre',
    });
  }

  const pas = deuxSemaines(jm.filter((j) => j.jour !== aujourdhui), (j) => j.pas, addDays(aujourdhui, -1));
  if (pas.cette !== null)
    axes.push({
      cle: 'pas',
      titre: '🚶 Pas / jour',
      valeur: String(Math.round(pas.cette)),
      couleur: pas.cette >= 8000 ? 'vert' : pas.cette >= 5000 ? 'ambre' : 'rouge',
      ...evolution(pas.cette, pas.avant, (n) => String(Math.round(n)), 'haut'),
      aller: 'montre',
    });

  axes.push({
    cle: 'bilans',
    titre: '🩸 Bilans',
    valeur: p.anomalies.length === 0 ? 'rien à signaler' : `${p.anomalies.length} à suivre`,
    couleur: p.anomalies.length === 0 ? 'vert' : 'rouge',
    evolution: p.anomalies.length ? p.anomalies.slice(0, 3).join(', ') : null,
    progres: null,
    aller: 'bilans',
  });
  return axes;
}

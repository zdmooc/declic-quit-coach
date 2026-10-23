/**
 * Planificateur de notifications (RM-12, ADR-0007).
 * Pur : il reçoit des candidates et des préférences, et rend la liste à programmer.
 */

import { addDays, localDateOf, minutesOfDay, parseTimeOfDay, zonedInstant, type Instant, type TimeOfDay } from './time';

export type CategorieNotif = 'substitut' | 'plan' | 'rythme' | 'sante' | 'economies' | 'bilan';

/** Ordre de priorité : la première catégorie l'emporte en cas de plafond atteint. */
export const PRIORITE: readonly CategorieNotif[] = ['substitut', 'plan', 'rythme', 'sante', 'economies', 'bilan'];

export interface Candidate {
  /** Clé stable : deux candidates de même clé sont la même notification. */
  cle: string;
  a: Instant;
  categorie: CategorieNotif;
  /** Une notification critique (rappel de patch) ignore le plafond et les heures calmes. */
  critique: boolean;
  titre: string;
  corps: string;
  /** Une notification « reportable » est décalée à la fin des heures calmes au lieu d'être supprimée. */
  reportable?: boolean;
}

export interface PreferencesNotif {
  heuresCalmesDebut: TimeOfDay;
  heuresCalmesFin: TimeOfDay;
  maxNonCritiquesParJour: number;
  horizonHeures: number;
  /** Limite iOS : 64 notifications locales en attente. */
  maxEnAttente: number;
  categories: Record<CategorieNotif, boolean>;
}

export const PREFERENCES_PAR_DEFAUT: PreferencesNotif = {
  heuresCalmesDebut: '22:30',
  heuresCalmesFin: '07:30',
  maxNonCritiquesParJour: 4,
  horizonHeures: 48,
  maxEnAttente: 64,
  categories: { substitut: true, plan: true, rythme: true, sante: true, economies: true, bilan: true },
};

function dansHeuresCalmes(t: Instant, prefs: PreferencesNotif, tz: string): boolean {
  const m = minutesOfDay(t, tz);
  const debut = parseTimeOfDay(prefs.heuresCalmesDebut);
  const fin = parseTimeOfDay(prefs.heuresCalmesFin);
  return debut <= fin ? m >= debut && m < fin : m >= debut || m < fin;
}

function finHeuresCalmes(t: Instant, prefs: PreferencesNotif, tz: string): Instant {
  const jour = localDateOf(t, tz);
  const finCeJour = zonedInstant(jour, prefs.heuresCalmesFin, tz);
  return finCeJour > t ? finCeJour : zonedInstant(addDays(jour, 1), prefs.heuresCalmesFin, tz);
}

export function planifier(
  candidates: readonly Candidate[],
  prefs: PreferencesNotif,
  maintenant: Instant,
  tz: string,
): Candidate[] {
  const limite = maintenant + prefs.horizonHeures * 3_600_000;

  // 1. Catégories désactivées, heures calmes, horizon.
  const ajustees: Candidate[] = [];
  for (const c of candidates) {
    if (!prefs.categories[c.categorie]) continue;
    let a = c.a;
    if (!c.critique && dansHeuresCalmes(a, prefs, tz)) {
      if (!c.reportable) continue;
      a = finHeuresCalmes(a, prefs, tz);
    }
    if (a <= maintenant || a > limite) continue;
    ajustees.push({ ...c, a });
  }

  // 2. Dédoublonnage par clé (on garde la plus proche).
  const parCle = new Map<string, Candidate>();
  for (const c of ajustees) {
    const existante = parCle.get(c.cle);
    if (!existante || c.a < existante.a) parCle.set(c.cle, c);
  }

  // 3. Plafond quotidien des non critiques, par priorité puis par ordre chronologique.
  const rang = (c: Candidate) => PRIORITE.indexOf(c.categorie);
  const parJour = new Map<string, Candidate[]>();
  const retenues: Candidate[] = [];
  for (const c of parCle.values()) {
    if (c.critique) {
      retenues.push(c);
      continue;
    }
    const jour = localDateOf(c.a, tz);
    parJour.set(jour, [...(parJour.get(jour) ?? []), c]);
  }
  for (const liste of parJour.values()) {
    liste.sort((x, y) => rang(x) - rang(y) || x.a - y.a);
    retenues.push(...liste.slice(0, prefs.maxNonCritiquesParJour));
  }

  // 4. Ordre chronologique et limite du système.
  return retenues.sort((x, y) => x.a - y.a).slice(0, prefs.maxEnAttente);
}

/**
 * Progrès : records (F5.6), bilan de la semaine (F6.7), courbe du plan (F2.4)
 * et économies projetées (F5.3). Projections pures, calculées à partir du journal rejoué.
 */

import { libelleContexte } from './analyse';
import { historiqueJournees, journeeCourante, type EtatJournal, type JourneeHistorique } from './dashboard';
import { dateDuZero, quotaDuJour } from './reduction';
import { addDays, daysBetween, minutesBetween, type Instant, type LocalDate } from './time';

export interface Records {
  /** Jours entiers sans cigarette depuis la dernière (arrondi inférieur). */
  joursSansTabac: number;
  /** Journée terminée la plus basse (hors journées vides de l'observation). */
  meilleureJournee: { jour: LocalDate; fumees: number } | null;
  /** Cigarettes évitées depuis le début du plan (journées terminées) par rapport à la référence. */
  cigarettesEvitees: number;
  /** Plus longue série de journées terminées au quota ou en dessous. */
  serieQuotaTenu: number;
}

export interface BilanSemaine {
  du: LocalDate;
  au: LocalDate;
  /** Journées prises en compte (terminées, au plus 7). */
  jours: number;
  fumees: number;
  moyenneParJour: number;
  evitees: number;
  economieCents: number;
  enviesResistees: number;
  intervallesTenus: number;
  tropTot: number;
  /** Moyenne par jour de la semaine précédente, pour comparer ; `null` si pas de données. */
  moyenneSemainePrecedente: number | null;
  declencheur: string | null;
}

export interface PointCourbe {
  jour: LocalDate;
  quota: number;
  /** Cigarettes fumées ce jour-là (journées passées et en cours), sinon `null`. */
  fumees: number | null;
}

export interface Progres {
  records: Records;
  bilanSemaine: BilanSemaine | null;
  courbe: PointCourbe[];
  dateDuZero: LocalDate | null;
  /** Référence utilisée pour « évitées » : consommation mesurée (plan) ou déclarée. */
  reference: number;
}

const somme = (xs: readonly number[]) => xs.reduce((s, x) => s + x, 0);

function bilan(etat: EtatJournal, journees: readonly JourneeHistorique[], reference: number): BilanSemaine | null {
  const semaine = journees.slice(0, 7);
  if (semaine.length === 0) return null;
  const precedente = journees.slice(7, 14);
  const fumees = somme(semaine.map((j) => j.fumees));
  const evitees = somme(semaine.filter((j) => j.enPlan).map((j) => Math.max(0, reference - j.fumees)));
  const parContexte = new Map<string, number>();
  for (const c of semaine.flatMap((j) => j.cigarettes)) {
    if (!c.contexte) continue;
    const l = libelleContexte(c.contexte, etat.contextesPerso);
    parContexte.set(l, (parContexte.get(l) ?? 0) + 1);
  }
  const declencheur = [...parContexte.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return {
    du: semaine[semaine.length - 1]!.jour,
    au: semaine[0]!.jour,
    jours: semaine.length,
    fumees,
    moyenneParJour: fumees / semaine.length,
    evitees,
    economieCents: somme(semaine.map((j) => j.economieCents ?? 0)),
    enviesResistees: somme(semaine.map((j) => j.envies)),
    intervallesTenus: somme(semaine.map((j) => j.respectees)),
    tropTot: somme(semaine.map((j) => j.nonRespectees)),
    moyenneSemainePrecedente: precedente.length > 0 ? somme(precedente.map((j) => j.fumees)) / precedente.length : null,
    declencheur,
  };
}

/** Courbe du plan, du premier jour jusqu'au zéro (au plus 120 jours). */
function courbePlan(etat: EtatJournal, journees: readonly JourneeHistorique[], aujourdhui: LocalDate): PointCourbe[] {
  const plan = etat.plan;
  if (!plan) return [];
  const fin = dateDuZero(plan.input) ?? addDays(plan.input.dateDebut, 119);
  const nb = Math.min(120, Math.max(1, daysBetween(plan.input.dateDebut, fin) + 1));
  const fumeesParJour = new Map(journees.map((j) => [j.jour, j.fumees]));
  return Array.from({ length: nb }, (_, i) => {
    const jour = addDays(plan.input.dateDebut, i);
    const passe = daysBetween(jour, aujourdhui) >= 0;
    return { jour, quota: quotaDuJour(plan.input, jour), fumees: passe ? (fumeesParJour.get(jour) ?? 0) : null };
  });
}

export function progres(etat: EtatJournal, maintenant: Instant, tz: string): Progres {
  const aujourdhui = journeeCourante(etat, maintenant, tz);
  const toutes = historiqueJournees(etat, maintenant, tz, 120);
  const terminees = toutes.filter((j) => j.jour !== aujourdhui);
  const reference = etat.plan?.reference ?? etat.declare;

  const derniere = etat.cigarettes.length > 0 ? Math.max(...etat.cigarettes.map((c) => c.a)) : null;
  const depuis = derniere ?? etat.plan?.demarreLe ?? etat.profilCreeLe;
  const joursSansTabac = Math.max(0, Math.floor(minutesBetween(depuis, maintenant) / (24 * 60)));

  // Journées vides de l'observation : pas des « meilleures journées », juste des journées non notées.
  const candidates = terminees.filter((j) => j.enPlan || j.fumees > 0);
  const meilleure = candidates.reduce<JourneeHistorique | null>((m, j) => (m === null || j.fumees < m.fumees ? j : m), null);

  const enPlan = terminees.filter((j) => j.enPlan);
  let serie = 0;
  let courante = 0;
  for (const j of [...enPlan].reverse()) {
    courante = j.quota !== null && j.fumees <= j.quota ? courante + 1 : 0;
    serie = Math.max(serie, courante);
  }

  return {
    records: {
      joursSansTabac,
      meilleureJournee: meilleure ? { jour: meilleure.jour, fumees: meilleure.fumees } : null,
      cigarettesEvitees: somme(enPlan.map((j) => Math.max(0, reference - j.fumees))),
      serieQuotaTenu: serie,
    },
    bilanSemaine: bilan(etat, terminees, reference),
    courbe: courbePlan(etat, toutes, aujourdhui),
    dateDuZero: etat.plan ? dateDuZero(etat.plan.input) : null,
    reference,
  };
}

/* ------------------------------------------------------------------ */
/* Séries pour le graphique : par jour, par semaine, par mois           */
/* ------------------------------------------------------------------ */

export type Granularite = 'jour' | 'semaine' | 'mois';

export interface PointSerie {
  /** Jour, lundi de la semaine ISO, ou premier jour du mois. */
  debut: LocalDate;
  /** Cigarettes de la période (total réel : avant-plan et sans-heure compris). */
  total: number;
  /** Journées renseignées de la période. */
  jours: number;
  /** Moyenne par journée renseignée (comparable d'une période à l'autre). */
  moyenneParJour: number;
  /** Quota moyen des journées du plan de la période ; `null` hors plan. */
  quotaMoyen: number | null;
  /** Au moins une journée partielle ou en cours : moyenne à lire avec prudence. */
  incomplet: boolean;
}

const lundi = (j: LocalDate) => addDays(j, -((new Date(`${j}T12:00:00Z`).getUTCDay() + 6) % 7));
const premierDuMois = (j: LocalDate) => `${j.slice(0, 7)}-01`;

/**
 * Regroupe les journées de l'historique. Seules les journées renseignées comptent (une journée
 * sans aucune saisie avant le début du suivi n'est pas un « zéro »). Les journées partielles sont
 * passées en paramètre (historique importé) et la journée en cours est toujours incomplète.
 */
export function serieConsommation(
  journees: readonly JourneeHistorique[],
  granularite: Granularite,
  options: { aujourdhui: LocalDate; partielles?: ReadonlySet<LocalDate>; max?: number },
): PointSerie[] {
  const renseignees = journees.filter((j) => j.total > 0 || j.enPlan);
  if (renseignees.length === 0) return [];
  const cle = granularite === 'jour' ? (j: LocalDate) => j : granularite === 'semaine' ? lundi : premierDuMois;
  const groupes = new Map<LocalDate, JourneeHistorique[]>();
  for (const j of renseignees) groupes.set(cle(j.jour), [...(groupes.get(cle(j.jour)) ?? []), j]);
  const max = options.max ?? (granularite === 'jour' ? 30 : 12);
  return [...groupes.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-max)
    .map(([debut, js]) => {
      const total = somme(js.map((j) => j.total));
      const plan = js.filter((j) => j.quota !== null);
      return {
        debut,
        total,
        jours: js.length,
        moyenneParJour: total / js.length,
        quotaMoyen: plan.length > 0 ? somme(plan.map((j) => j.quota!)) / plan.length : null,
        incomplet: js.some((j) => j.jour === options.aujourdhui || options.partielles?.has(j.jour)),
      };
    });
}

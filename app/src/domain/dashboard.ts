/**
 * Projections : on rejoue le journal d'événements pour obtenir l'état,
 * puis on calcule le tableau de bord du jour (ADR-0003, CQRS léger).
 */

import { effectiveEvents, instantOf, type DomainEvent, type TypeSubstitutOral } from './events';
import { intervalleCibleMinutes, intervalleMoyenMinutes, plusLonguePauseMinutes, prochaineCigarette, type StatutProchaine } from './intervals';
import { dateDuZero, quotaDuJour, quotas, MOINS_UN_PAR_JOUR, type PlanInput } from './reduction';
import {
  economieEnCoursCents,
  economieJourneeCents,
  joursAvantObjectif,
  prixDuJour,
  projectionArret,
  valeurCents,
  type Prix,
  type Projection,
} from './savings';
import { etatOral, etatPatch, type EtatOral, type EtatPatch, type PatchEnCours, type ReferencePharma } from './substitutes';
import { addDays, awakeWindow, daysBetween, minutesBetween, planDayOf, zonedInstant, type Horaires, type Instant, type LocalDate } from './time';

export interface EtatJournal {
  initial: number;
  plan: PlanInput;
  horaires: Horaires;
  prix: Prix[];
  /** Cigarettes avec leur journée de plan. */
  cigarettes: { a: Instant; jour: LocalDate }[];
  envies: { a: Instant; jour: LocalDate }[];
  patch: PatchEnCours | null;
  oraux: { a: Instant; jour: LocalDate; forme: TypeSubstitutOral }[];
  objectifs: { libelle: string; montantCents: number }[];
  /** Instant de création du plan (RM-13 : le premier jour ne compte qu'à partir de là). */
  demarreLe: Instant;
  /** Identifiant du dernier événement saisi par l'utilisateur (pour « annuler »). */
  derniereSaisieId: string | null;
}

/** Rejoue le journal. `null` tant que le profil et le plan n'existent pas. */
export function rejouer(events: readonly DomainEvent[]): EtatJournal | null {
  const evs = effectiveEvents(events);
  const profil = evs.find((e) => e.type === 'ProfilCree');
  const demarrage = evs.find((e) => e.type === 'PlanDemarre');
  if (!profil || profil.type !== 'ProfilCree' || !demarrage || demarrage.type !== 'PlanDemarre') return null;

  const etat: EtatJournal = {
    initial: profil.payload.cigarettesParJour,
    plan: {
      initial: profil.payload.cigarettesParJour,
      dateDebut: demarrage.payload.dateDebut,
      rythmes: [{ aPartirDu: demarrage.payload.dateDebut, strategie: demarrage.payload.strategie ?? MOINS_UN_PAR_JOUR }],
      paliers: [],
    },
    horaires: { wake: profil.payload.lever, bed: profil.payload.coucher },
    prix: [
      {
        aPartirDu: demarrage.payload.dateDebut,
        prixPaquetCents: profil.payload.prixPaquetCents,
        cigarettesParPaquet: profil.payload.cigarettesParPaquet,
      },
    ],
    cigarettes: [],
    envies: [],
    patch: null,
    oraux: [],
    objectifs: [],
    demarreLe: instantOf(demarrage),
    derniereSaisieId: null,
  };

  const rythmes = [...etat.plan.rythmes];
  const paliers: LocalDate[] = [];
  for (const e of evs) {
    const a = instantOf(e);
    switch (e.type) {
      case 'HorairesModifies':
        etat.horaires = { wake: e.payload.lever, bed: e.payload.coucher };
        break;
      case 'RythmeModifie':
        rythmes.push({ aPartirDu: e.payload.aPartirDu, strategie: e.payload.strategie });
        break;
      case 'PalierDemande':
        paliers.push(e.payload.jour);
        break;
      case 'PrixModifie':
        etat.prix.push({
          aPartirDu: e.payload.aPartirDu,
          prixPaquetCents: e.payload.prixPaquetCents,
          cigarettesParPaquet: e.payload.cigarettesParPaquet,
        });
        break;
      case 'CigaretteFumee':
        etat.cigarettes.push({ a, jour: planDayOf(a, etat.horaires, e.tz) });
        etat.derniereSaisieId = e.id;
        break;
      case 'EnvieResistee':
        etat.envies.push({ a, jour: planDayOf(a, etat.horaires, e.tz) });
        etat.derniereSaisieId = e.id;
        break;
      case 'PatchPose':
        etat.patch = { poseLe: a, dosageMg: e.payload.dosageMg, dureePortHeures: e.payload.dureePortHeures };
        etat.derniereSaisieId = e.id;
        break;
      case 'PatchRetire':
        etat.patch = null;
        etat.derniereSaisieId = e.id;
        break;
      case 'SubstitutOralPris':
        etat.oraux.push({ a, jour: planDayOf(a, etat.horaires, e.tz), forme: e.payload.forme });
        etat.derniereSaisieId = e.id;
        break;
      case 'ObjectifEpargneDefini':
        etat.objectifs.push({ libelle: e.payload.libelle, montantCents: e.payload.montantCents });
        break;
      default:
        break;
    }
  }
  etat.plan = { ...etat.plan, rythmes, paliers };
  return etat;
}

/**
 * RM-13 : si le plan a été créé en cours de journée, le premier jour ne compte qu'à partir
 * de sa création. Renvoie le début du comptage et la part de la journée éveillée restante.
 */
export function premierJourPartiel(etat: EtatJournal, tz: string): { debut: Instant; fraction: number } | null {
  if (planDayOf(etat.demarreLe, etat.horaires, tz) !== etat.plan.dateDebut) return null;
  const f = awakeWindow(etat.plan.dateDebut, etat.horaires, tz);
  const total = f.end - f.start;
  if (total <= 0 || etat.demarreLe <= f.start) return null;
  const debut = Math.min(etat.demarreLe, f.end);
  return { debut, fraction: (f.end - debut) / total };
}

/** Quota affiché d'un jour : celui du plan, réduit au prorata le premier jour partiel. */
export function quotaEffectif(etat: EtatJournal, jour: LocalDate, tz: string): number {
  const q = quotaDuJour(etat.plan, jour);
  const p = jour === etat.plan.dateDebut ? premierJourPartiel(etat, tz) : null;
  return p ? Math.min(q, Math.max(1, Math.ceil(q * p.fraction))) : q;
}

export interface LigneHistorique {
  jour: LocalDate;
  quota: number;
  fumees: number;
  economieCents: number;
}

/** Historique des journées terminées, du début du plan jusqu'à la veille de `aujourdhui`. */
export function historiqueQuotidien(etat: EtatJournal, aujourdhui: LocalDate, tz: string): LigneHistorique[] {
  const hier = addDays(aujourdhui, -1);
  if (daysBetween(etat.plan.dateDebut, hier) < 0) return [];
  const parJour = new Map<LocalDate, number>();
  for (const c of etat.cigarettes) parJour.set(c.jour, (parJour.get(c.jour) ?? 0) + 1);
  const out: LigneHistorique[] = [];
  const p0 = premierJourPartiel(etat, tz);
  for (const [jour, quotaPlan] of quotas(etat.plan, hier)) {
    const fumees = parJour.get(jour) ?? 0;
    const prix = prixDuJour(etat.prix, jour);
    const partiel = jour === etat.plan.dateDebut ? p0 : null;
    out.push({
      jour,
      quota: partiel ? quotaEffectif(etat, jour, tz) : quotaPlan,
      fumees,
      economieCents: partiel
        ? valeurCents(Math.max(0, etat.initial * partiel.fraction - fumees), prix)
        : economieJourneeCents(etat.initial, fumees, prix),
    });
  }
  return out;
}

export type Phase = 'avant-debut' | 'reduction' | 'arret' | 'maintien';

export interface TableauDeBord {
  jour: LocalDate;
  /** Jour du plan, 0 = premier jour. */
  jourDuPlan: number;
  phase: Phase;
  quota: number;
  fumees: number;
  restant: number;
  prochaine: StatutProchaine;
  intervalleCibleMinutes: number | null;
  intervalleMoyenMinutes: number | null;
  enviesResistees: number;
  depuisDerniereMinutes: number | null;
  plusLonguePauseMinutes: number;
  economieJourCents: number;
  economieTotaleCents: number;
  projection: Projection;
  dateDuZero: LocalDate | null;
  patch: EtatPatch;
  oraux: EtatOral[];
  objectifs: { libelle: string; montantCents: number; joursRestants: number | null }[];
  proposerPalier: boolean;
  /** Début du comptage de la journée (lever, ou création du plan le premier jour). */
  debutJournee: Instant;
}

export function tableauDeBord(etat: EtatJournal, maintenant: Instant, tz: string, ref: ReferencePharma): TableauDeBord {
  const jour = planDayOf(maintenant, etat.horaires, tz);
  const jourDuPlan = daysBetween(etat.plan.dateDebut, jour);
  const quotaPlan = quotaDuJour(etat.plan, jour);
  const quota = quotaEffectif(etat, jour, tz);
  const fenetre = awakeWindow(jour, etat.horaires, tz);
  const p0 = jour === etat.plan.dateDebut ? premierJourPartiel(etat, tz) : null;
  // Le rythme du plan reste « temps éveillé ÷ quota du plan », même le premier jour partiel.
  const intervalle = intervalleCibleMinutes(fenetre, p0 ? quotaPlan : quota);
  const duJour = etat.cigarettes.filter((c) => c.jour === jour).map((c) => c.a);
  const toutes = etat.cigarettes.map((c) => c.a);
  const derniere = toutes.length > 0 ? Math.max(...toutes) : null;

  const prix = prixDuJour(etat.prix, jour);
  const historique = historiqueQuotidien(etat, jour, tz);
  const economieJour =
    jourDuPlan < 0
      ? 0
      : economieEnCoursCents({ initial: etat.initial, fumees: duJour.length, prix, fenetre, maintenant, debutComptage: p0?.debut });
  const economieTotale = historique.reduce((s, l) => s + l.economieCents, 0) + economieJour;

  const debutPlan = premierJourPartiel(etat, tz)?.debut ?? zonedInstant(etat.plan.dateDebut, etat.horaires.wake, tz);
  const depuisDerniere = derniere === null ? null : Math.max(0, minutesBetween(derniere, maintenant));
  const sansTabacMinutes = depuisDerniere ?? Math.max(0, minutesBetween(debutPlan, maintenant));
  const phase: Phase =
    jourDuPlan < 0 ? 'avant-debut' : quota > 0 ? 'reduction' : sansTabacMinutes < 7 * 24 * 60 ? 'arret' : 'maintien';

  const hier = historique[historique.length - 1];
  // Rythme d'épargne : moyenne des 7 dernières journées, sinon l'économie prévue par le quota du jour.
  const recents = historique.slice(-7);
  const rythme =
    recents.length > 0
      ? recents.reduce((s, l) => s + l.economieCents, 0) / recents.length
      : economieJourneeCents(etat.initial, quotaPlan, prix);

  return {
    jour,
    jourDuPlan,
    phase,
    quota,
    fumees: duJour.length,
    restant: Math.max(0, quota - duJour.length),
    prochaine: prochaineCigarette({ maintenant, fenetre, quota, fumeesAujourdhui: duJour, intervalleMinutes: intervalle ?? undefined }),
    intervalleCibleMinutes: intervalle,
    intervalleMoyenMinutes: intervalleMoyenMinutes(duJour),
    enviesResistees: etat.envies.filter((e) => e.jour === jour).length,
    depuisDerniereMinutes: depuisDerniere,
    plusLonguePauseMinutes: plusLonguePauseMinutes(toutes, maintenant, Math.min(debutPlan, maintenant)),
    economieJourCents: economieJour,
    economieTotaleCents: economieTotale,
    projection: projectionArret(etat.initial, prix),
    dateDuZero: dateDuZero(etat.plan),
    patch: etatPatch(etat.patch, maintenant),
    oraux: (['pastille', 'gomme'] as const).map((forme) =>
      etatOral(forme, etat.oraux.filter((o) => o.jour === jour && o.forme === forme).length, ref),
    ),
    objectifs: etat.objectifs.map((o) => ({
      ...o,
      joursRestants: joursAvantObjectif(o.montantCents, economieTotale, rythme),
    })),
    proposerPalier: hier !== undefined && hier.fumees > hier.quota && !etat.plan.paliers.includes(jour),
    debutJournee: p0?.debut ?? fenetre.start,
  };
}

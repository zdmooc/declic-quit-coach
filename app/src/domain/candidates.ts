/**
 * Génère les notifications candidates à partir de l'état et du tableau de bord.
 * Le planificateur (`notifications.ts`) applique ensuite les règles anti-spam.
 * Ton : jamais culpabilisant (RM-11).
 */

import type { EtatJournal, TableauDeBord } from './dashboard';
import { PALIERS_ECONOMIES_CENTS, prochainsJalons, type ContenuSante } from './milestones';
import type { Candidate } from './notifications';
import { quotaDuJour } from './reduction';
import { prixDuJour } from './savings';
import { addDays, awakeWindow, isoWeekday, zonedInstant, type Instant } from './time';
import { intervalleCibleMinutes } from './intervals';

export function formatDuree(minutes: number): string {
  const m = Math.round(minutes);
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r} min`;
  return r === 0 ? `${h} h` : `${h} h ${String(r).padStart(2, '0')}`;
}

export function genererCandidates(
  etat: EtatJournal,
  tdb: TableauDeBord,
  maintenant: Instant,
  tz: string,
  sante: ContenuSante,
): Candidate[] {
  const out: Candidate[] = [];

  // Message du matin : quota et intervalle du jour (aujourd'hui si le lever est à venir, et demain).
  for (const jour of [tdb.jour, addDays(tdb.jour, 1)]) {
    const quota = quotaDuJour(etat.plan, jour);
    const fenetre = awakeWindow(jour, etat.horaires, tz);
    const intervalle = intervalleCibleMinutes(fenetre, quota);
    out.push({
      cle: `plan-${jour}`,
      a: fenetre.start,
      categorie: 'plan',
      critique: false,
      titre: quota === 0 ? 'Journée sans tabac' : `Aujourd'hui : ${quota} cigarette${quota > 1 ? 's' : ''} maximum`,
      corps:
        quota === 0 || intervalle === null
          ? 'Tu as tout ce qu\'il faut. Le bouton SOS est là si une envie arrive.'
          : `Une toutes les ${formatDuree(intervalle)} environ. Chaque cigarette en moins compte.`,
    });
  }

  // Prochaine cigarette possible, avec une invitation à repousser.
  if (tdb.prochaine.statut === 'attendre') {
    out.push({
      cle: `prochaine-${tdb.jour}-${tdb.fumees}`,
      a: tdb.prochaine.a,
      categorie: 'rythme',
      critique: false,
      titre: 'Ta prochaine cigarette est possible',
      corps: 'Tu peux aussi tenter 10 minutes de plus. Chaque minute gagnée compte.',
    });
  }

  // Rappel de patch : seule notification critique.
  if (tdb.patch.statut === 'porte') {
    const patch = etat.patch;
    out.push({
      cle: `patch-${patch?.poseLe ?? 0}`,
      a: tdb.patch.retraitPrevu,
      categorie: 'substitut',
      critique: true,
      titre: patch?.dureePortHeures === 24 ? 'Pense à changer ton patch' : 'Pense à retirer ton patch',
      corps: 'Durée de port atteinte. Suis la notice ou l\'avis de ton professionnel de santé.',
    });
  }

  // Bénéfices santé depuis la dernière cigarette.
  const derniere = etat.cigarettes.length > 0 ? Math.max(...etat.cigarettes.map((c) => c.a)) : null;
  if (derniere !== null && sante.jalons.length > 0) {
    for (const j of prochainsJalons(sante, derniere, maintenant)) {
      out.push({
        cle: `sante-${j.id}-${derniere}`,
        a: j.a,
        categorie: 'sante',
        critique: false,
        reportable: true,
        titre: `${formatDuree(j.heures * 60)} sans fumer`,
        corps: j.message,
      });
    }
  }

  // Prochain palier d'économies (s'il est atteint aujourd'hui sans autre cigarette).
  const palier = prochainPalierEconomies(etat, tdb, maintenant, tz);
  if (palier) out.push(palier);

  // Bilan hebdomadaire : dimanche à 19 h.
  for (let i = 0; i < 7; i++) {
    const jour = addDays(tdb.jour, i);
    if (isoWeekday(jour) === 7) {
      out.push({
        cle: `bilan-${jour}`,
        a: zonedInstant(jour, '19:00', tz),
        categorie: 'bilan',
        critique: false,
        reportable: true,
        titre: 'Ton bilan de la semaine est prêt',
        corps: 'Cigarettes évitées, économies, envies résistées : viens voir ton chemin.',
      });
      break;
    }
  }

  return out;
}

/**
 * Prochain palier d'économies atteint aujourd'hui si aucune autre cigarette n'est fumée :
 * l'économie du jour croît linéairement sur la fenêtre d'éveil. Sans état à mémoriser :
 * un palier déjà franchi n'est jamais reprogrammé, et une cigarette fumée décale l'heure.
 */
export function prochainPalierEconomies(
  etat: EtatJournal,
  tdb: TableauDeBord,
  maintenant: Instant,
  tz: string,
): Candidate | null {
  if (tdb.phase === 'avant-debut') return null;
  const palier = PALIERS_ECONOMIES_CENTS.find((p) => p > tdb.economieTotaleCents);
  if (palier === undefined) return null;
  const fenetre = awakeWindow(tdb.jour, etat.horaires, tz);
  const dureeMinutes = (fenetre.end - fenetre.start) / 60_000;
  if (dureeMinutes <= 0) return null;
  const prix = prixDuJour(etat.prix, tdb.jour);
  const prixUnitaire = prix.prixPaquetCents / prix.cigarettesParPaquet;
  // Économie du jour à l'instant t : (initial × fraction(t) − fumées) × prix unitaire, si positive.
  const historiqueCents = tdb.economieTotaleCents - tdb.economieJourCents;
  const eviteesNecessaires = (palier - historiqueCents) / prixUnitaire;
  const fraction = (eviteesNecessaires + tdb.fumees) / etat.initial;
  if (fraction > 1) return null;
  const a = fenetre.start + Math.ceil(fraction * dureeMinutes) * 60_000;
  if (a <= maintenant) return null;
  return candidatePalierEconomies(palier, a);
}

/** Notification de célébration d'un palier d'économies. */
export function candidatePalierEconomies(palierCents: number, a: Instant): Candidate {
  const euros = Math.round(palierCents / 100);
  return {
    cle: `economies-${palierCents}`,
    a,
    categorie: 'economies',
    critique: false,
    reportable: true,
    titre: `${euros} € économisés !`,
    corps: 'C\'est de l\'argent qui reste dans ta poche. Tu peux le dédier à un objectif.',
  };
}

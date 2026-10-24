/**
 * Génère les notifications candidates à partir de l'état et du tableau de bord.
 * Le planificateur (`notifications.ts`) applique ensuite les règles anti-spam.
 * Ton : jamais culpabilisant (RM-11).
 */

import { messagePreventif } from './coach';
import { debutHabituelDe, dureeActive, type EtatJournal, type TableauDeBord } from './dashboard';
import { intervalleCibleMinutes } from './intervals';
import { PALIERS_ECONOMIES_CENTS, prochainsJalons, type ContenuSante } from './milestones';
import type { Candidate } from './notifications';
import { quotaDuJour } from './reduction';
import { prixDuJour } from './savings';
import { addDays, daysBetween, isoWeekday, zonedInstant, type Instant } from './time';

export function formatDuree(minutes: number): string {
  if (minutes < 1) return 'moins d’1 min';
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
  const plan = etat.plan;

  // Observation terminée : on prévient que le bilan et la proposition de plan sont prêts.
  if (!plan && tdb.observation?.terminee) {
    out.push({
      cle: 'observation-terminee',
      a: maintenant + 60_000,
      categorie: 'plan',
      critique: false,
      reportable: true,
      titre: 'Ton bilan d’observation est prêt',
      corps: 'Ta consommation réelle, tes horaires et tes déclencheurs : on peut lancer ton plan.',
    });
  }

  // Message du matin, à l'heure habituelle de la première cigarette : quota et intervalle du jour.
  for (const jour of plan ? [tdb.jour, addDays(tdb.jour, 1)] : []) {
    if (!plan || daysBetween(plan.input.dateDebut, jour) < 0) continue;
    const quota = quotaDuJour(plan.input, jour);
    const intervalle = intervalleCibleMinutes(dureeActive(plan.horaires), quota);
    out.push({
      cle: `plan-${jour}`,
      a: debutHabituelDe(etat, jour, tz),
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
  // Pendant l'observation, on ne pousse pas à fumer : le compte à rebours reste indicatif à l'écran.
  if (tdb.prochaine?.statut === 'attendre' && tdb.sourceIntervalle === 'plan') {
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
  const palier = prochainPalierEconomies(etat, tdb, maintenant);
  if (palier) out.push(palier);

  // F6.8 : prévention, 10 min avant l'heure la plus chargée (plan lancé, au moins 7 cigarettes analysées).
  const preventif = messagePreventif(tdb);
  const heureRisque = tdb.analyse.heuresARisque[0];
  if (plan && tdb.phase !== 'avant-debut' && preventif && heureRisque && tdb.analyse.cigarettes >= 7) {
    for (const jour of [tdb.jour, addDays(tdb.jour, 1)]) {
      const a = zonedInstant(jour, `${String(heureRisque.heure).padStart(2, '0')}:00`, tz) - 10 * 60_000;
      if (a <= maintenant) continue;
      out.push({ cle: `preventif-${jour}`, a, categorie: 'rythme', critique: false, titre: preventif.titre, corps: preventif.texte });
    }
  }

  // F7.3 : bilan du soir, à l'heure habituelle de la dernière cigarette (plan lancé).
  if (plan && tdb.phase !== 'avant-debut') {
    const a = zonedInstant(tdb.jour, plan.horaires.bed, tz);
    if (a > maintenant) {
      out.push({
        cle: `soir-${tdb.jour}`,
        a,
        categorie: 'bilan',
        critique: false,
        reportable: false,
        titre: 'Ton bilan du soir',
        corps: 'Comment s’est passée ta journée ? Ton coach a préparé un mot pour toi.',
      });
    }
  }

  // Bilan hebdomadaire : dimanche à 19 h, une fois le plan lancé.
  for (let i = 0; plan && i < 7; i++) {
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
): Candidate | null {
  if (!etat.plan || tdb.phase === 'avant-debut' || tdb.phase === 'observation') return null;
  const palier = PALIERS_ECONOMIES_CENTS.find((p) => p > tdb.economieTotaleCents);
  if (palier === undefined) return null;
  const fenetre = tdb.fenetreJour;
  const dureeMinutes = (fenetre.end - fenetre.start) / 60_000;
  if (dureeMinutes <= 0) return null;
  const prix = prixDuJour(etat.prix, tdb.jour);
  const prixUnitaire = prix.prixPaquetCents / prix.cigarettesParPaquet;
  // Économie du jour à l'instant t : (initial × fraction(t) − fumées) × prix unitaire, si positive.
  const historiqueCents = tdb.economieTotaleCents - tdb.economieJourCents;
  const eviteesNecessaires = (palier - historiqueCents) / prixUnitaire;
  const fraction = (eviteesNecessaires + tdb.fumees) / etat.plan.reference;
  // Le comptage démarre avec la journée, ou au démarrage du plan le premier jour (RM-13).
  const a = tdb.debutJournee + Math.ceil(fraction * dureeMinutes) * 60_000;
  if (a > fenetre.end || a <= maintenant) return null;
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

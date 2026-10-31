/**
 * État rejoué du journal (ADR-0003) : un seul passage sur les événements effectifs donne
 * l'état courant de tous les contextes (tabac, substituts, caféine, santé, parades).
 * Les journées sont définies par les cigarettes (RM-14, ADR-0008), pas par l'horloge.
 */

import { type ContextePerso } from './analyse';
import { effectiveEvents, instantOf, type ContexteCigarette, type DomainEvent, type PrecisionHeure, type TypeSubstitutOral } from './events';
import { MOINS_UN_PAR_JOUR, type PlanInput } from './reduction';
import { type Prix } from './savings';
import { etiqueterCigarettes, journeeDe, SEUIL_NUIT_MINUTES } from './sessions';
import type { Bilan } from './sante';
import { type Boisson } from './cafeine';
import { type PatchEnCours } from './substitutes';
import { localDateOf, type Horaires, type Instant, type LocalDate } from './time';

/** Durée de l'observation (RM-15), en journées terminées. */
export const JOURS_OBSERVATION = 3;
/** Horaires par défaut quand rien n'est mesuré (démarrage sans observation). */
export const HORAIRES_PAR_DEFAUT: Horaires = { wake: '07:00', bed: '23:00' };

export interface CigaretteJournal {
  id: string;
  a: Instant;
  jour: LocalDate;
  contexte?: ContexteCigarette;
  /** Absente = exacte (saisie en direct). */
  precision?: PrecisionHeure;
}

export interface PlanEnCours {
  input: PlanInput;
  /** Consommation de référence, base des économies (RM-07). */
  reference: number;
  /** Heures habituelles de la première et de la dernière cigarette. */
  horaires: Horaires;
  demarreLe: Instant;
  origine: 'observation' | 'declaration';
}

export interface EtatJournal {
  declare: number;
  profilCreeLe: Instant;
  dejaFumeAujourdhui: boolean;
  prix: Prix[];
  plan: PlanEnCours | null;
  cigarettes: CigaretteJournal[];
  envies: { a: Instant; jour: LocalDate; strategie?: string; contexte?: ContexteCigarette }[];
  /** Parade (nouveau réflexe) choisie par contexte. */
  parades: Partial<Record<ContexteCigarette, string>>;
  /** Date à laquelle la parade actuelle a été choisie (pour mesurer son effet). */
  paradesDepuis: Partial<Record<ContexteCigarette, LocalDate>>;
  /** Bilans biologiques et normes du laboratoire / objectifs du médecin (RM-23). */
  bilans: Bilan[];
  /** Boissons caféinées et palier de caféine (RM-25). */
  boissons: { id: string; a: Instant; jour: LocalDate; boisson: Boisson }[];
  quotaCafeine: number | null;
  normes: Record<string, { min?: number; max?: number }>;
  /** Envies signalées (distinctes des envies résistées), avec leur issue. */
  enviesSignalees: { a: Instant; jour: LocalDate; issue: 'resistee' | 'cigarette' | 'inconnue'; technique?: string }[];
  /** Saisies historiques sans heure connue (agrégats par journée). */
  sansHeure: { jour: LocalDate; nature: 'cigarettes' | 'envies-signalees'; nombre: number }[];
  patch: PatchEnCours | null;
  /** Historique des patchs : pose, dosage, durée prévue, retrait. */
  patchs: { poseLe: Instant; dosageMg: number; dureePortHeures: 16 | 24; retireLe: Instant | null }[];
  oraux: { a: Instant; jour: LocalDate; forme: TypeSubstitutOral; dosageMg: number }[];
  objectifs: { libelle: string; montantCents: number }[];
  /** Contextes ajoutés par l'utilisateur (RM-16). */
  contextesPerso: ContextePerso[];
  /** Intervalle recommandé pendant l'observation (réglage). */
  intervalleRecommande: number;
  /** Journées mesurées avant de proposer le plan (1 à 7, 3 par défaut). */
  joursObservation: number;
  /** Étape 3 (stabilisation) : date de début, ou `null` (RM-32). */
  stabilisationDepuis: LocalDate | null;
  /** Raisons personnelles d'arrêter (SOS envie). */
  raisons: string[];
  /** Consentement à l'envoi d'un résumé non identifiant au coach IA (F1.6, F7.6). */
  coachIa: boolean;
  /** Dernier événement saisi par l'utilisateur (pour « annuler »). */
  derniereSaisieId: string | null;
  derniereCigaretteId: string | null;
}

const SAISIES: ReadonlySet<DomainEvent['type']> = new Set([
  'CigaretteFumee',
  'EnvieResistee',
  'PatchPose',
  'PatchRetire',
  'SubstitutOralPris',
]);

/** Rejoue le journal. `null` tant que le profil n'existe pas. */
export function rejouer(events: readonly DomainEvent[], tz: string): EtatJournal | null {
  const evs = effectiveEvents(events);
  const profil = evs.find((e) => e.type === 'ProfilCree');
  if (!profil || profil.type !== 'ProfilCree') return null;
  const creeLe = instantOf(profil);

  const etat: EtatJournal = {
    declare: profil.payload.cigarettesParJour,
    profilCreeLe: creeLe,
    dejaFumeAujourdhui: profil.payload.dejaFumeAujourdhui,
    prix: [
      {
        aPartirDu: localDateOf(creeLe, profil.tz),
        prixPaquetCents: profil.payload.prixPaquetCents,
        cigarettesParPaquet: profil.payload.cigarettesParPaquet,
      },
    ],
    plan: null,
    cigarettes: [],
    envies: [],
    enviesSignalees: [],
    sansHeure: [],
    patch: null,
    patchs: [],
    oraux: [],
    objectifs: [],
    contextesPerso: [],
    intervalleRecommande: INTERVALLE_RECOMMANDE_OBSERVATION_MINUTES,
    joursObservation: JOURS_OBSERVATION,
    stabilisationDepuis: null,
    raisons: [],
    parades: {},
    paradesDepuis: {},
    bilans: [],
    boissons: [],
    quotaCafeine: null,
    normes: {},
    coachIa: false,
    derniereSaisieId: null,
    derniereCigaretteId: null,
  };

  // 1. Cigarettes, avec leurs corrections (contexte, heure réelle), puis étiquetage des journées.
  const corrections = new Map<string, { contexte?: ContexteCigarette; occurredAt?: string }>();
  for (const e of evs) {
    if (e.type === 'CigaretteCorrigee') {
      const { evenementId, ...champs } = e.payload;
      corrections.set(evenementId, { ...corrections.get(evenementId), ...champs });
    }
  }
  const brutes: (Omit<CigaretteJournal, 'jour'> & { journee?: LocalDate })[] = [];
  for (const e of evs) {
    if (e.type !== 'CigaretteFumee') continue;
    const c = corrections.get(e.id);
    const contexte = c?.contexte ?? e.payload.contexte;
    const { precision, journee } = e.payload;
    brutes.push({
      id: e.id,
      a: c?.occurredAt ? Date.parse(c.occurredAt) : instantOf(e),
      ...(contexte ? { contexte } : {}),
      // Une heure corrigée par l'utilisateur redevient exacte.
      ...(precision && precision !== 'exacte' && !c?.occurredAt ? { precision } : {}),
      ...(journee ? { journee } : {}),
    });
    etat.derniereCigaretteId = e.id;
  }
  brutes.sort((x, y) => x.a - y.a);
  const jours = etiqueterCigarettes(
    brutes.map((c) => c.a),
    tz,
    SEUIL_NUIT_MINUTES,
    brutes.map((c) => c.journee),
  );
  etat.cigarettes = brutes.map(({ journee: _j, ...c }, i) => ({ ...c, jour: jours[i]! }));

  // 2. Autres événements.
  const rythmes: PlanInput['rythmes'][number][] = [];
  const paliers: LocalDate[] = [];
  const fixes: { aPartirDu: LocalDate; quota: number }[] = [];
  for (const e of evs) {
    const a = instantOf(e);
    if (SAISIES.has(e.type)) etat.derniereSaisieId = e.id;
    switch (e.type) {
      case 'PlanDemarre':
        if (etat.plan) break; // un seul démarrage
        rythmes.push({ aPartirDu: e.payload.dateDebut, strategie: e.payload.strategie ?? MOINS_UN_PAR_JOUR });
        etat.plan = {
          input: { initial: e.payload.quotaDepart, dateDebut: e.payload.dateDebut, rythmes, paliers, fixes },
          reference: e.payload.referenceParJour,
          horaires: { wake: e.payload.debutHabituel, bed: e.payload.finHabituelle },
          // Maximum imposé : la journée compte en entier, comme si le plan avait commencé avec elle.
          demarreLe: e.payload.journeeEntiere
            ? Math.min(a, ...etat.cigarettes.filter((c) => c.jour === e.payload.dateDebut).map((c) => c.a))
            : a,
          origine: e.payload.origine,
        };
        break;
      case 'RythmeModifie':
        rythmes.push({ aPartirDu: e.payload.aPartirDu, strategie: e.payload.strategie });
        break;
      case 'PalierDemande':
        paliers.push(e.payload.jour);
        break;
      case 'PalierFixe':
        fixes.push({ aPartirDu: e.payload.aPartirDu, quota: e.payload.quota });
        break;
      case 'PrixModifie':
        etat.prix.push({
          aPartirDu: e.payload.aPartirDu,
          prixPaquetCents: e.payload.prixPaquetCents,
          cigarettesParPaquet: e.payload.cigarettesParPaquet,
        });
        break;
      case 'EnvieResistee':
        etat.envies.push({
          a,
          jour: e.payload.journee ?? journeeDe(a, etat.cigarettes, tz),
          ...(e.payload.strategieUtilisee ? { strategie: e.payload.strategieUtilisee } : {}),
          ...(e.payload.contexte ? { contexte: e.payload.contexte } : {}),
        });
        break;
      case 'EnvieSignalee':
        etat.enviesSignalees.push({
          a,
          jour: e.payload.journee ?? journeeDe(a, etat.cigarettes, tz),
          issue: e.payload.issue,
          ...(e.payload.technique ? { technique: e.payload.technique } : {}),
        });
        break;
      case 'AgregatSansHeure':
        etat.sansHeure.push({ jour: e.payload.journee, nature: e.payload.nature, nombre: e.payload.nombre });
        break;
      case 'PatchPose': {
        // Un nouveau patch remplace le précédent s'il n'a pas été déclaré retiré.
        const ouvert = etat.patchs.find((p) => p.retireLe === null);
        if (ouvert) ouvert.retireLe = a;
        etat.patch = { poseLe: a, dosageMg: e.payload.dosageMg, dureePortHeures: e.payload.dureePortHeures };
        etat.patchs.push({ ...etat.patch, retireLe: null });
        break;
      }
      case 'PatchRetire': {
        const ouvert = etat.patchs.find((p) => p.retireLe === null);
        if (ouvert) ouvert.retireLe = a;
        etat.patch = null;
        break;
      }
      case 'BoissonPrise':
        etat.boissons.push({ id: e.id, a, jour: journeeDe(a, etat.cigarettes, tz), boisson: e.payload.boisson });
        break;
      case 'PalierCafeine':
        etat.quotaCafeine = e.payload.quota;
        break;
      case 'SubstitutOralPris':
        etat.oraux.push({ a, jour: journeeDe(a, etat.cigarettes, tz), forme: e.payload.forme, dosageMg: e.payload.dosageMg });
        break;
      case 'ObjectifEpargneDefini':
        etat.objectifs = etat.objectifs.filter((o) => o.libelle !== e.payload.libelle.trim());
        etat.objectifs.push({ libelle: e.payload.libelle.trim(), montantCents: e.payload.montantCents });
        break;
      case 'ObjectifRetire':
        etat.objectifs = etat.objectifs.filter((o) => o.libelle !== e.payload.libelle);
        break;
      case 'ConsentementModifie':
        if (e.payload.finalite === 'coach-ia') etat.coachIa = e.payload.accorde;
        break;
      case 'RaisonAjoutee':
        etat.raisons.push(e.payload.texte.trim());
        break;
      case 'ContexteRenomme': {
        const c = etat.contextesPerso.find((x) => x.cle === e.payload.cle);
        if (c) c.libelle = e.payload.libelle.trim();
        break;
      }
      case 'ContexteArchive': {
        const c = etat.contextesPerso.find((x) => x.cle === e.payload.cle);
        if (c) c.archive = true;
        break;
      }
      case 'BilanSaisi':
        etat.bilans.push({ id: e.id, date: e.payload.date, valeurs: e.payload.valeurs });
        break;
      case 'NormeDefinie':
        etat.normes[e.payload.parametre] = {
          ...(e.payload.min !== undefined ? { min: e.payload.min } : {}),
          ...(e.payload.max !== undefined ? { max: e.payload.max } : {}),
        };
        break;
      case 'ParadeDefinie':
        if (e.payload.parade.trim()) {
          if (!etat.parades[e.payload.contexte]) etat.paradesDepuis[e.payload.contexte] = journeeDe(a, etat.cigarettes, tz);
          etat.parades[e.payload.contexte] = e.payload.parade.trim();
        } else {
          delete etat.parades[e.payload.contexte];
          delete etat.paradesDepuis[e.payload.contexte];
        }
        break;
      case 'StabilisationDemarree':
        etat.stabilisationDepuis = e.payload.aPartirDu;
        break;
      case 'ObservationReglee':
        etat.joursObservation = e.payload.jours;
        break;
      case 'IntervalleRecommandeModifie':
        etat.intervalleRecommande = e.payload.minutes;
        break;
      case 'ContexteAjoute':
        if (!etat.contextesPerso.some((c) => c.cle === e.payload.cle)) {
          etat.contextesPerso.push({ cle: e.payload.cle, libelle: e.payload.libelle.trim() });
        }
        break;
      default:
        break;
    }
  }
  return etat;
}


/** Intervalle recommandé pendant l'observation (indicatif, sans notification). */
export const INTERVALLE_RECOMMANDE_OBSERVATION_MINUTES = 60;

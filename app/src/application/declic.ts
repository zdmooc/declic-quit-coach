/**
 * Cas d'usage de Déclic. Orchestration uniquement : les règles sont dans le domaine.
 */

import {
  addDays,
  localDateOf,
  zonedInstant,
  garde,
  messageDuSoir,
  progres,
  resumeCoach,
  reponseGarde,
  type MessageCoach,
  type ModeCoach,
  type Progres,
  genererCandidates,
  historiqueJournees,
  prixDuJour,
  strategieCourante,
  LIBELLES_CONTEXTE,
  MOINS_UN_PAR_JOUR,
  PALIERS_LIBRES,
  quotaDuJour,
  planifier,
  PREFERENCES_PAR_DEFAUT,
  proposerPlan,
  rejouer,
  tableauDeBord,
  validateEvent,
  type Candidate,
  type ContenuSante,
  type ContexteCigarette,
  type ContextePerso,
  type ContextePredefini,
  type JourneeHistorique,
  type DomainEvent,
  type EtatJournal,
  type PreferencesNotif,
  type ReductionStrategy,
  type ReferencePharma,
  type TableauDeBord,
  type TypeSubstitutOral,
} from '../domain';
import type { Clock, CoachIa, EventStore, IdGenerator, Notifier, TourCoach } from '../ports';
import { analyserImport, lireFichierDeclic, simulerImport, VERSION_EXPORT, type Apercu, type Choix, type Simulation } from './migration';

export interface DeclicDeps {
  store: EventStore;
  clock: Clock;
  ids: IdGenerator;
  notifier: Notifier;
  referencePharma: ReferencePharma;
  contenuSante: ContenuSante;
  preferencesNotif?: PreferencesNotif;
  /** Coach IA ; absent tant qu'il n'est pas configuré (l'app reste complète sans lui). */
  coachIa?: CoachIa;
}

export interface Reglages {
  prixPaquetCents: number;
  cigarettesParPaquet: number;
  intervalleRecommande: number;
  planDemarre: boolean;
  strategie: ReductionStrategy | null;
  /** Quota du plan aujourd'hui (palier en cours) ; `null` avant le plan. */
  palierActuel: number | null;
  contextesPerso: ContextePerso[];
}

export interface NouveauProfil {
  /** Estimation déclarée : la vraie consommation est mesurée pendant l'observation. */
  cigarettesParJour: number;
  prixPaquetCents: number;
  cigarettesParPaquet: number;
  dejaFumeAujourdhui: boolean;
}

type Source = DomainEvent['source'];

/** Lit et valide un fichier d'export Déclic (v1 ou v2) destiné à une restauration complète. */
export function lireSauvegarde(texte: string): DomainEvent[] {
  const { events } = lireFichierDeclic(texte);
  if (!events.some((e) => e.type === 'ProfilCree')) throw new Error('Sauvegarde sans profil');
  return events;
}

export class Declic {
  constructor(private readonly deps: DeclicDeps) {}

  private evenement<T extends DomainEvent['type']>(
    type: T,
    payload: Extract<DomainEvent, { type: T }>['payload'],
    source: Source = 'phone',
  ): Extract<DomainEvent, { type: T }> {
    const { clock, ids } = this.deps;
    return {
      id: ids.next(),
      type,
      schemaVersion: 1,
      occurredAt: new Date(clock.now()).toISOString(),
      tz: clock.timeZone(),
      source,
      payload,
    } as Extract<DomainEvent, { type: T }>;
  }

  private async ajouter(...events: DomainEvent[]): Promise<void> {
    for (const e of events) {
      const erreurs = validateEvent(e);
      if (erreurs.length > 0) throw new Error(`Événement ${e.type} invalide : ${erreurs.join(', ')}`);
    }
    for (const e of events) await this.deps.store.append(e);
    await this.replanifierNotifications();
  }

  private async etat(): Promise<EtatJournal | null> {
    return rejouer(await this.deps.store.all(), this.deps.clock.timeZone());
  }

  /** Supprime toutes les données (F9.2) et les notifications programmées. */
  async effacerToutesLesDonnees(): Promise<void> {
    await this.deps.store.effacer();
    await this.deps.notifier.remplacer([]);
  }

  async aUnProfil(): Promise<boolean> {
    return (await this.etat()) !== null;
  }

  /** Crée le profil : la phase d'observation commence (RM-15). */
  creerProfil(p: NouveauProfil): Promise<void> {
    return this.ajouter(this.evenement('ProfilCree', { ...p }));
  }

  /**
   * Démarre le plan avec la proposition courante : mesurée si l'observation est terminée,
   * sinon à partir de la consommation déclarée (démarrage immédiat).
   */
  async demarrerPlan(strategie: ReductionStrategy = MOINS_UN_PAR_JOUR): Promise<void> {
    const etat = await this.etat();
    if (!etat || etat.plan) return;
    const { proposition } = proposerPlan(etat, this.deps.clock.now(), this.deps.clock.timeZone());
    await this.ajouter(this.evenement('PlanDemarre', { ...proposition, strategie }));
  }

  /** Enregistre une cigarette maintenant et renvoie son identifiant (pour préciser le contexte ensuite). */
  async enregistrerCigarette(contexte?: ContexteCigarette, source: Source = 'phone'): Promise<string> {
    const e = this.evenement('CigaretteFumee', contexte ? { contexte } : {}, source);
    await this.ajouter(e);
    return e.id;
  }

  /** Précise une cigarette : contexte (RM-16) et/ou heure réelle (« il y a 20 min »). */
  async preciserCigarette(evenementId: string, precision: { contexte?: ContexteCigarette; ilYaMinutes?: number }): Promise<void> {
    const payload: { evenementId: string; contexte?: ContexteCigarette; occurredAt?: string } = { evenementId };
    if (precision.contexte) payload.contexte = precision.contexte;
    if (precision.ilYaMinutes && precision.ilYaMinutes > 0) {
      payload.occurredAt = new Date(this.deps.clock.now() - precision.ilYaMinutes * 60_000).toISOString();
    }
    if (!payload.contexte && !payload.occurredAt) return;
    await this.ajouter(this.evenement('CigaretteCorrigee', payload));
  }

  /**
   * Corrige l'heure d'une cigarette (saisie après coup) : « HH:MM » le même jour civil que la
   * saisie, ou la veille si l'heure donnée est après l'heure saisie et passe minuit. Jamais dans le futur.
   */
  async corrigerHeure(evenementId: string, hhmm: string): Promise<void> {
    const heure = lireHeure(hhmm);
    const etat = await this.etat();
    const c = etat?.cigarettes.find((x) => x.id === evenementId);
    if (!c) throw new Error('Cigarette introuvable');
    const tz = this.deps.clock.timeZone();
    let a = zonedInstant(localDateOf(c.a, tz), heure, tz);
    if (a > this.deps.clock.now()) a = zonedInstant(addDays(localDateOf(c.a, tz), -1), heure, tz);
    if (a > this.deps.clock.now()) throw new Error('Cette heure est dans le futur');
    await this.ajouter(this.evenement('CigaretteCorrigee', { evenementId, occurredAt: new Date(a).toISOString() }));
  }

  /**
   * Ajoute un contexte personnel (RM-16) et renvoie sa clé. Si un contexte de même libellé
   * existe déjà (prédéfini ou personnel, sans tenir compte de la casse), il est réutilisé.
   */
  async ajouterContexte(libelleSaisi: string): Promise<ContexteCigarette> {
    const libelle = libelleSaisi.trim().replace(/\s+/g, ' ');
    const normal = (t: string) => t.toLocaleLowerCase('fr-FR');
    const predefini = (Object.entries(LIBELLES_CONTEXTE) as [ContextePredefini, string][]).find(
      ([cle, l]) => cle !== 'autre' && normal(l) === normal(libelle),
    );
    if (predefini) return predefini[0];
    const etat = await this.etat();
    const existant = etat?.contextesPerso.find((c) => normal(c.libelle) === normal(libelle));
    if (existant) return existant.cle;
    const cle: `perso:${string}` = `perso:${this.deps.ids.next()}`;
    await this.ajouter(this.evenement('ContexteAjoute', { cle, libelle }));
    return cle;
  }

  /** Ajoute une raison personnelle d'arrêter, rappelée pendant le SOS envie. */
  ajouterRaison(texte: string): Promise<void> {
    return this.ajouter(this.evenement('RaisonAjoutee', { texte: texte.trim() }));
  }

  enregistrerEnvieResistee(strategieUtilisee?: string, source: Source = 'phone'): Promise<void> {
    return this.ajouter(this.evenement('EnvieResistee', strategieUtilisee ? { strategieUtilisee } : {}, source));
  }

  /** SOS envie ouvert puis fermé sans « l'envie est passée » : l'envie est comptée, issue inconnue. */
  signalerEnvie(): Promise<void> {
    return this.ajouter(this.evenement('EnvieSignalee', { issue: 'inconnue' }));
  }

  /** Supprime une saisie précise depuis l'historique (elle reste dans le journal, annulée). */
  annulerSaisie(evenementId: string): Promise<void> {
    return this.ajouter(this.evenement('SaisieAnnulee', { evenementId }));
  }

  /* ---------------- Réglages ---------------- */

  /** Nouveau prix du paquet, à partir de la journée en cours (le passé n'est pas réécrit, RM-06). */
  async modifierPrix(prixPaquetCents: number, cigarettesParPaquet: number): Promise<void> {
    const tdb = await this.tableauDeBord();
    if (!tdb) return;
    await this.ajouter(this.evenement('PrixModifie', { prixPaquetCents, cigarettesParPaquet, aPartirDu: tdb.jour }));
  }

  /** Nouveau rythme de réduction, à partir de la journée suivante. */
  async modifierRythme(strategie: ReductionStrategy): Promise<void> {
    const etat = await this.etat();
    const tdb = await this.tableauDeBord();
    if (!etat?.plan || !tdb) return;
    await this.ajouter(this.evenement('RythmeModifie', { aPartirDu: addDays(tdb.jour, 1), strategie }));
  }

  /**
   * Descente par paliers libres : fixe dès aujourd'hui un palier plus bas que le quota en cours
   * (jamais au-dessus : on ne revient pas au palier précédent). Le plan passe en « paliers libres »
   * (pas de baisse automatique) tant que l'utilisateur ne choisit pas un autre rythme, comme −1 par jour.
   */
  async fixerPalier(quota: number): Promise<void> {
    const etat = await this.etat();
    const tdb = await this.tableauDeBord();
    if (!etat?.plan || !tdb) throw new Error('Démarre d’abord ton plan');
    const actuel = quotaDuJour(etat.plan.input, tdb.jour);
    if (!Number.isInteger(quota) || quota < 0) throw new Error('Palier invalide');
    if (quota >= actuel) throw new Error(`Le nouveau palier doit être sous le palier actuel (${actuel})`);
    const events: DomainEvent[] = [];
    if (strategieCourante(etat.plan.input, tdb.jour).pas !== 0)
      events.push(this.evenement('RythmeModifie', { aPartirDu: tdb.jour, strategie: PALIERS_LIBRES }));
    events.push(this.evenement('PalierFixe', { aPartirDu: tdb.jour, quota }));
    await this.ajouter(...events);
  }

  /** Intervalle recommandé pendant l'observation (10 à 240 min). */
  modifierIntervalleRecommande(minutes: number): Promise<void> {
    return this.ajouter(this.evenement('IntervalleRecommandeModifie', { minutes }));
  }

  renommerContexte(cle: `perso:${string}`, libelle: string): Promise<void> {
    return this.ajouter(this.evenement('ContexteRenomme', { cle, libelle: libelle.trim().replace(/\s+/g, ' ') }));
  }

  archiverContexte(cle: `perso:${string}`): Promise<void> {
    return this.ajouter(this.evenement('ContexteArchive', { cle }));
  }

  /** Export complet du journal (JSON), pour sauvegarde ou portabilité (F9.1, RGPD). */
  async exporterDonnees(): Promise<string> {
    const events = await this.deps.store.all();
    // Compact (sans indentation) : un an d'historique tient en moins d'1 Mo.
    return JSON.stringify({ format: 'declic-export', version: VERSION_EXPORT, exporteLe: new Date(this.deps.clock.now()).toISOString(), events });
  }

  /**
   * Restaure une sauvegarde (F9.1) : tout est vérifié AVANT d'effacer quoi que ce soit.
   * Le journal est remplacé à l'identique (mêmes identifiants, même ordre).
   */
  async importerDonnees(texte: string): Promise<{ evenements: number; journees: number }> {
    const events = lireSauvegarde(texte);
    const etat = rejouer(events, this.deps.clock.timeZone());
    if (!etat) throw new Error('Sauvegarde sans profil');
    await this.deps.store.effacer();
    for (const e of events) await this.deps.store.append(e);
    await this.replanifierNotifications();
    return { evenements: events.length, journees: new Set(etat.cigarettes.map((c) => c.jour)).size };
  }

  /** Import d'historique, étape 1 : analyse du fichier SANS RIEN ÉCRIRE. */
  async apercuImport(texte: string): Promise<Apercu> {
    return analyserImport(await this.deps.store.all(), lireFichierDeclic(texte), this.deps.clock.timeZone());
  }

  /** Étape 2 : totaux, anomalies et événements selon les choix de rapprochement (sans rien écrire). */
  async simulerImport(apercu: Apercu, choix: Choix): Promise<Simulation> {
    return simulerImport(await this.deps.store.all(), apercu, choix, this.deps.clock.timeZone());
  }

  /**
   * Étape 3 : écrit les événements validés (ajouts uniquement). Refuse si une divergence n'est
   * pas tranchée, si un choix est incohérent ou si le journal a changé depuis l'aperçu.
   */
  async confirmerImport(apercu: Apercu, choix: Choix): Promise<number> {
    if (apercu.bloquant) throw new Error(apercu.bloquant);
    const actuels = await this.deps.store.all();
    if (actuels.length !== apercu.empreinte) throw new Error('Des saisies ont changé depuis l’aperçu : relance l’aperçu avant d’importer');
    const sim = simulerImport(actuels, apercu, choix, this.deps.clock.timeZone());
    if (sim.restantes > 0) throw new Error(`${sim.restantes} rapprochement(s) à décider avant l’import`);
    if (sim.erreurs.length > 0) throw new Error(sim.erreurs.join(' '));
    const ids = new Set(actuels.map((e) => e.id));
    const events = sim.evenements.filter((e) => !ids.has(e.id));
    await this.ajouter(...events);
    return events.length;
  }

  /** Historique détaillé des journées (écran Historique). */
  async historique(nbJours = 30): Promise<JourneeHistorique[]> {
    const etat = await this.etat();
    if (!etat) return [];
    return historiqueJournees(etat, this.deps.clock.now(), this.deps.clock.timeZone(), nbJours);
  }

  /** Réglages courants. */
  async reglages(): Promise<Reglages | null> {
    const etat = await this.etat();
    if (!etat) return null;
    const tdb = await this.tableauDeBord();
    const prix = prixDuJour(etat.prix, tdb!.jour);
    return {
      prixPaquetCents: prix.prixPaquetCents,
      cigarettesParPaquet: prix.cigarettesParPaquet,
      intervalleRecommande: etat.intervalleRecommande,
      planDemarre: etat.plan !== null,
      strategie: etat.plan ? strategieCourante(etat.plan.input, addDays(tdb!.jour, 1)) : null,
      palierActuel: etat.plan ? quotaDuJour(etat.plan.input, tdb!.jour) : null,
      contextesPerso: etat.contextesPerso.filter((c) => !c.archive),
    };
  }

  async annulerDerniereSaisie(): Promise<boolean> {
    const etat = await this.etat();
    if (!etat?.derniereSaisieId) return false;
    await this.ajouter(this.evenement('SaisieAnnulee', { evenementId: etat.derniereSaisieId }));
    return true;
  }

  async demanderPalier(): Promise<void> {
    const tdb = await this.tableauDeBord();
    if (!tdb || tdb.phase === 'observation') return;
    await this.ajouter(this.evenement('PalierDemande', { jour: tdb.jour }));
  }

  /**
   * Pose d'un patch, maintenant ou à une heure passée (« HH:MM », aujourd'hui ou la veille si
   * l'heure n'est pas encore passée) : pour savoir quelles cigarettes ont été fumées sous patch.
   */
  async poserPatch(dosageMg: number, dureePortHeures: 16 | 24, hhmm?: string): Promise<void> {
    return this.ajouter(this.aHeure(this.evenement('PatchPose', { dosageMg, dureePortHeures }), hhmm));
  }

  async retirerPatch(hhmm?: string): Promise<void> {
    return this.ajouter(this.aHeure(this.evenement('PatchRetire', {}), hhmm));
  }

  /** Antidate un événement à « HH:MM » (heure récente, jamais dans le futur) ; vide = maintenant. */
  private aHeure<E extends DomainEvent>(e: E, hhmm?: string): E {
    if (!hhmm?.trim()) return e;
    const tz = this.deps.clock.timeZone();
    const now = this.deps.clock.now();
    const heure = lireHeure(hhmm);
    let a = zonedInstant(localDateOf(now, tz), heure, tz);
    if (a > now) a = zonedInstant(addDays(localDateOf(now, tz), -1), heure, tz);
    return { ...e, occurredAt: new Date(a).toISOString() };
  }

  prendreSubstitutOral(forme: TypeSubstitutOral, dosageMg: number, source: Source = 'phone'): Promise<void> {
    return this.ajouter(this.evenement('SubstitutOralPris', { forme, dosageMg }, source));
  }

  definirObjectif(libelle: string, montantCents: number): Promise<void> {
    return this.ajouter(this.evenement('ObjectifEpargneDefini', { libelle: libelle.trim(), montantCents }));
  }

  retirerObjectif(libelle: string): Promise<void> {
    return this.ajouter(this.evenement('ObjectifRetire', { libelle }));
  }

  /** F1.6 / F7.6 : consentement à l'envoi d'un résumé non identifiant au coach IA. */
  consentirCoachIa(accorde: boolean): Promise<void> {
    return this.ajouter(this.evenement('ConsentementModifie', { finalite: 'coach-ia', accorde }));
  }

  /** Records, bilan de la semaine, courbe du plan (F5.6, F6.7, F2.4). */
  async progres(): Promise<Progres | null> {
    const etat = await this.etat();
    if (!etat) return null;
    return progres(etat, this.deps.clock.now(), this.deps.clock.timeZone());
  }

  /** Mot du coach scripté (F7.3 / F7.4), disponible hors ligne et sans IA. */
  async motDuCoach(): Promise<MessageCoach | null> {
    const etat = await this.etat();
    if (!etat) return null;
    const maintenant = this.deps.clock.now();
    const tz = this.deps.clock.timeZone();
    return messageDuSoir(tableauDeBord(etat, maintenant, tz, this.deps.referencePharma), progres(etat, maintenant, tz));
  }

  /** Branche (ou débranche) le coach IA une fois son adresse saisie dans les réglages. */
  brancherCoach(coach: CoachIa | undefined): void {
    this.deps.coachIa = coach;
  }

  /** Le coach IA est-il utilisable (configuré et consenti) ? */
  async coachIaDisponible(): Promise<boolean> {
    const etat = await this.etat();
    return Boolean(this.deps.coachIa && etat?.coachIa);
  }

  /**
   * F7.2 à F7.5 : un tour de conversation avec le coach IA. Les garde-fous passent AVANT
   * tout envoi : détresse, symptôme ou question de dosage reçoivent une réponse fixe.
   */
  async parlerAuCoach(mode: ModeCoach, tours: TourCoach[]): Promise<{ texte: string; garde: boolean }> {
    const dernier = [...tours].reverse().find((t) => t.role === 'user');
    const g = dernier ? garde(dernier.texte) : null;
    if (g) return { texte: reponseGarde(g), garde: true };
    const etat = await this.etat();
    if (!etat || !this.deps.coachIa || !etat.coachIa) throw new Error('Coach IA non activé');
    const maintenant = this.deps.clock.now();
    const tz = this.deps.clock.timeZone();
    const resume = resumeCoach(tableauDeBord(etat, maintenant, tz, this.deps.referencePharma), progres(etat, maintenant, tz));
    const texte = await this.deps.coachIa.repondre({ mode, resume, tours: tours.slice(-12) });
    return { texte, garde: false };
  }

  async tableauDeBord(): Promise<TableauDeBord | null> {
    const etat = await this.etat();
    if (!etat) return null;
    return tableauDeBord(etat, this.deps.clock.now(), this.deps.clock.timeZone(), this.deps.referencePharma);
  }

  /** Recalcule et reprogramme les notifications (à appeler aussi à chaque ouverture de l'app). */
  async replanifierNotifications(): Promise<Candidate[]> {
    const { clock, notifier, contenuSante } = this.deps;
    const etat = await this.etat();
    if (!etat) {
      await notifier.remplacer([]);
      return [];
    }
    const maintenant = clock.now();
    const tz = clock.timeZone();
    const tdb = tableauDeBord(etat, maintenant, tz, this.deps.referencePharma);
    // Contenus santé non validés : jamais notifiés.
    const sante = contenuSante.validePar ? contenuSante : { ...contenuSante, jalons: [] };
    const planifiees = planifier(
      genererCandidates(etat, tdb, maintenant, tz, sante),
      this.deps.preferencesNotif ?? PREFERENCES_PAR_DEFAUT,
      maintenant,
      tz,
    );
    await notifier.remplacer(planifiees);
    return planifiees;
  }
}

/** « 8:45 », « 08h45 », « 0845 » → « 08:45 ». */
function lireHeure(hhmm: string): string {
  const m = /^(\d{1,2})[:h ]?(\d{2})$/.exec(hhmm.trim());
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) throw new Error('Heure invalide (format 08:45)');
  return `${m[1]!.padStart(2, '0')}:${m[2]}`;
}

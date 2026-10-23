/**
 * Cas d'usage de Déclic. Orchestration uniquement : les règles sont dans le domaine.
 */

import {
  genererCandidates,
  LIBELLES_CONTEXTE,
  MOINS_UN_PAR_JOUR,
  planifier,
  PREFERENCES_PAR_DEFAUT,
  proposerPlan,
  rejouer,
  tableauDeBord,
  validateEvent,
  type Candidate,
  type ContenuSante,
  type ContexteCigarette,
  type ContextePredefini,
  type DomainEvent,
  type EtatJournal,
  type PreferencesNotif,
  type ReductionStrategy,
  type ReferencePharma,
  type TableauDeBord,
  type TypeSubstitutOral,
} from '../domain';
import type { Clock, EventStore, IdGenerator, Notifier } from '../ports';

export interface DeclicDeps {
  store: EventStore;
  clock: Clock;
  ids: IdGenerator;
  notifier: Notifier;
  referencePharma: ReferencePharma;
  contenuSante: ContenuSante;
  preferencesNotif?: PreferencesNotif;
}

export interface NouveauProfil {
  /** Estimation déclarée : la vraie consommation est mesurée pendant l'observation. */
  cigarettesParJour: number;
  prixPaquetCents: number;
  cigarettesParPaquet: number;
  dejaFumeAujourdhui: boolean;
}

type Source = DomainEvent['source'];

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

  poserPatch(dosageMg: number, dureePortHeures: 16 | 24): Promise<void> {
    return this.ajouter(this.evenement('PatchPose', { dosageMg, dureePortHeures }));
  }

  retirerPatch(): Promise<void> {
    return this.ajouter(this.evenement('PatchRetire', {}));
  }

  prendreSubstitutOral(forme: TypeSubstitutOral, dosageMg: number, source: Source = 'phone'): Promise<void> {
    return this.ajouter(this.evenement('SubstitutOralPris', { forme, dosageMg }, source));
  }

  definirObjectif(libelle: string, montantCents: number): Promise<void> {
    return this.ajouter(this.evenement('ObjectifEpargneDefini', { libelle, montantCents }));
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

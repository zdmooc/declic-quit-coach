/**
 * Cas d'usage de Déclic. Orchestration uniquement : les règles sont dans le domaine.
 */

import {
  genererCandidates,
  localDateOf,
  MOINS_UN_PAR_JOUR,
  planifier,
  PREFERENCES_PAR_DEFAUT,
  rejouer,
  tableauDeBord,
  validateEvent,
  type Candidate,
  type ContenuSante,
  type ContexteCigarette,
  type DomainEvent,
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
  cigarettesParJour: number;
  prixPaquetCents: number;
  cigarettesParPaquet: number;
  lever: string;
  coucher: string;
  strategie?: ReductionStrategy;
  /** Par défaut : aujourd'hui. */
  dateDebut?: string;
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

  async aUnProfil(): Promise<boolean> {
    return rejouer(await this.deps.store.all()) !== null;
  }

  async creerProfil(p: NouveauProfil): Promise<void> {
    const dateDebut = p.dateDebut ?? localDateOf(this.deps.clock.now(), this.deps.clock.timeZone());
    await this.ajouter(
      this.evenement('ProfilCree', {
        cigarettesParJour: p.cigarettesParJour,
        prixPaquetCents: p.prixPaquetCents,
        cigarettesParPaquet: p.cigarettesParPaquet,
        lever: p.lever,
        coucher: p.coucher,
      }),
      this.evenement('PlanDemarre', { dateDebut, strategie: p.strategie ?? MOINS_UN_PAR_JOUR }),
    );
  }

  enregistrerCigarette(contexte?: ContexteCigarette, source: Source = 'phone'): Promise<void> {
    return this.ajouter(this.evenement('CigaretteFumee', contexte ? { contexte } : {}, source));
  }

  enregistrerEnvieResistee(strategieUtilisee?: string, source: Source = 'phone'): Promise<void> {
    return this.ajouter(this.evenement('EnvieResistee', strategieUtilisee ? { strategieUtilisee } : {}, source));
  }

  async annulerDerniereSaisie(): Promise<boolean> {
    const etat = rejouer(await this.deps.store.all());
    if (!etat?.derniereSaisieId) return false;
    await this.ajouter(this.evenement('SaisieAnnulee', { evenementId: etat.derniereSaisieId }));
    return true;
  }

  async demanderPalier(): Promise<void> {
    const tdb = await this.tableauDeBord();
    if (!tdb) return;
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
    const etat = rejouer(await this.deps.store.all());
    if (!etat) return null;
    return tableauDeBord(etat, this.deps.clock.now(), this.deps.clock.timeZone(), this.deps.referencePharma);
  }

  /** Recalcule et reprogramme les notifications (à appeler aussi à chaque ouverture de l'app). */
  async replanifierNotifications(extra: Candidate[] = []): Promise<Candidate[]> {
    const { store, clock, notifier, contenuSante } = this.deps;
    const etat = rejouer(await store.all());
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
      [...genererCandidates(etat, tdb, maintenant, tz, sante), ...extra],
      this.deps.preferencesNotif ?? PREFERENCES_PAR_DEFAUT,
      maintenant,
      tz,
    );
    await notifier.remplacer(planifiees);
    return planifiees;
  }
}

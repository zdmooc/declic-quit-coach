/**
 * Import d'historique (migration d'un journal tenu hors de l'app) — ADR-0010.
 *
 * Principes :
 * - le format d'échange reste `declic-export` ; la version 2 ajoute un bloc `meta` facultatif,
 *   des champs facultatifs aux saisies (précision, journée déclarée, note) et deux événements
 *   (`AgregatSansHeure`, `EnvieSignalee`). Un fichier v1 reste lisible tel quel ;
 * - la source de préparation `declic-historique-migration-source` est convertie en v2 ;
 * - l'import est ADDITIF : aucun événement existant n'est modifié ni supprimé ; rapprocher une
 *   saisie de l'app d'une cigarette du journal ajoute une correction, jamais un écrasement ;
 * - aucun rapprochement automatique : chaque divergence est tranchée par l'utilisateur dans
 *   l'aperçu, et rien n'est écrit avant sa validation ;
 * - les identifiants sont stables : réimporter le même fichier n'ajoute rien.
 */

import {
  etiqueterCigarettes,
  historiqueJournees,
  localDateOf,
  minutesBetween,
  offsetMinutes,
  rejouer,
  validateEvent,
  zonedInstant,
  CONTEXTES,
  SEUIL_NUIT_MINUTES,
  type ContexteCigarette,
  type DomainEvent,
  type Instant,
  type LocalDate,
} from '../domain';
import { libelleContexte } from '../domain/analyse';

export const TYPES_CONNUS: ReadonlySet<string> = new Set<DomainEvent['type']>([
  'ProfilCree', 'PlanDemarre', 'RythmeModifie', 'PalierDemande', 'CigaretteFumee', 'EnvieResistee', 'SaisieAnnulee',
  'CigaretteCorrigee', 'ContexteAjoute', 'RaisonAjoutee', 'ContexteRenomme', 'ContexteArchive', 'IntervalleRecommandeModifie',
  'PatchPose', 'PatchRetire', 'SubstitutOralPris', 'PrixModifie', 'ObjectifEpargneDefini', 'ObjectifRetire', 'ConsentementModifie',
  'AgregatSansHeure', 'EnvieSignalee', 'PalierFixe', 'ObservationReglee', 'ParadeDefinie', 'BilanSaisi', 'NormeDefinie', 'BoissonPrise', 'PalierCafeine', 'StabilisationDemarree',
]);

/** Version écrite par l'app ; les versions 1 et 2 sont lues. */
export const VERSION_EXPORT = 2;

/** Informations facultatives d'un fichier de migration (v2). */
export interface MetaMigration {
  type: 'migration';
  /** Source lisible (ex. « Journal Tabac et Café — Google Drive »). */
  source: string;
  periode: { du: LocalDate; au: LocalDate };
  /** Instant ISO jusqu'auquel la source est importée (journée en cours). */
  arreteLe?: string;
  /** Totaux attendus par journée, pour contrôle dans l'aperçu. */
  attendu?: Record<LocalDate, { cigarettes: number; partielle?: string; enCours?: boolean }>;
  /** Éléments de la source volontairement non importés (affichés dans l'aperçu). */
  nonImporte?: string[];
}

export interface FichierDeclic {
  version: 1 | 2;
  meta: MetaMigration | null;
  events: DomainEvent[];
}

function valider(events: readonly DomainEvent[], version: 1 | 2): void {
  const ids = new Set<string>();
  events.forEach((e, i) => {
    if (typeof e !== 'object' || e === null || !TYPES_CONNUS.has(e.type) || typeof e.payload !== 'object' || e.payload === null)
      throw new Error(`Événement n° ${i + 1} invalide`);
    if (version === 1 && (e.type === 'AgregatSansHeure' || e.type === 'EnvieSignalee'))
      throw new Error(`Événement n° ${i + 1} (${e.type}) : réservé au format v2`);
    const erreurs = validateEvent(e);
    if (erreurs.length > 0) throw new Error(`Événement n° ${i + 1} (${e.type}) : ${erreurs.join(', ')}`);
    if (ids.has(e.id)) throw new Error(`Événement n° ${i + 1} en double`);
    ids.add(e.id);
  });
}

/**
 * Lit un fichier Déclic : `declic-export` v1 ou v2, ou source de préparation
 * `declic-historique-migration-source` (convertie en v2). Lève une erreur lisible sinon.
 */
export function lireFichierDeclic(texte: string): FichierDeclic {
  let brut: unknown;
  try {
    brut = JSON.parse(texte.trim());
  } catch {
    throw new Error('Ce fichier n’est pas une sauvegarde Déclic (JSON illisible)');
  }
  const s = brut as { format?: unknown; version?: unknown; events?: unknown; meta?: unknown };
  if (s.format === FORMAT_SOURCE) return convertirSource(brut as SourceMigration);
  if (s.format !== 'declic-export' || !Array.isArray(s.events)) throw new Error('Ce fichier n’est pas une sauvegarde Déclic');
  if (s.version !== 1 && s.version !== 2) throw new Error(`Version de sauvegarde non prise en charge : ${String(s.version)}`);
  const events = s.events as DomainEvent[];
  valider(events, s.version);
  const meta = s.meta && typeof s.meta === 'object' && (s.meta as { type?: unknown }).type === 'migration' ? (s.meta as MetaMigration) : null;
  return { version: s.version, meta, events };
}

/* ------------------------------------------------------------------ */
/* Source de préparation → declic-export v2                             */
/* ------------------------------------------------------------------ */

export const FORMAT_SOURCE = 'declic-historique-migration-source';

interface SourceCigarette {
  numero: number;
  heure_locale: string | null;
  precision: string;
  source?: string;
  occurredAt_utc?: string;
  contexte?: string;
  note?: string;
}
interface SourceJour {
  date: LocalDate;
  completude: string;
  totalCigarettesConfirmees: number;
  cigarettes: SourceCigarette[];
  envies?: Record<string, number | boolean | null>;
  substituts?: { type: 'PatchPose' | 'PatchRetire'; heure_locale: string; dosageMg?: number; dureePortHeures?: 16 | 24; precision: string }[];
  commentaire?: string;
}
export interface SourceMigration {
  format: typeof FORMAT_SOURCE;
  version: number;
  reference?: { fuseau?: string; derniereInformationSuiviLocale?: string };
  sauvegardeOriginaleDeclicV1?: { format: string; version: number; events: DomainEvent[] };
  historique: SourceJour[];
}

const ORIGINE_SOURCE = 'Journal Tabac et Café (Google Drive)';
const estApprox = (precision: string) => /environ|approx/i.test(precision);
const estInconnue = (precision: string, heure: string | null) => heure === null || /absent|inconnu/i.test(precision);

/** Convertit la source de préparation en événements v2, sans inventer aucune heure. */
export function convertirSource(src: SourceMigration): FichierDeclic {
  if (!Array.isArray(src.historique)) throw new Error('Source de migration sans historique');
  const tz = src.reference?.fuseau ?? 'Europe/Paris';
  const events: DomainEvent[] = [];
  const nonImporte: string[] = [];
  const ajouter = (id: string, type: DomainEvent['type'], occurredAt: string, payload: object) =>
    events.push({ id, type, schemaVersion: 1, occurredAt, tz, source: 'import', payload } as DomainEvent);
  const arreteLe = src.reference?.derniereInformationSuiviLocale ? new Date(src.reference.derniereInformationSuiviLocale).toISOString() : null;
  const finDeJour = (j: LocalDate) => new Date(zonedInstant(j, '23:59', tz)).toISOString();

  // Saisies d'origine de l'app (déjà présentes sur le téléphone : reconnues par identifiant).
  const originaux = src.sauvegardeOriginaleDeclicV1?.events ?? [];

  const attendu: NonNullable<MetaMigration['attendu']> = {};
  for (const j of src.historique) {
    const enCours = /en cours/i.test(j.completude);
    const partielle = /partiel/i.test(j.completude) && !enCours ? j.completude : undefined;
    attendu[j.date] = { cigarettes: j.totalCigarettesConfirmees, ...(partielle ? { partielle } : {}), ...(enCours ? { enCours: true } : {}) };
    const sansHeure: number[] = [];
    for (const c of j.cigarettes) {
      if (estInconnue(c.precision, c.heure_locale)) {
        sansHeure.push(c.numero);
        continue;
      }
      const [jour, hm] = c.heure_locale!.split('T') as [LocalDate, string];
      const calcule = zonedInstant(jour, hm, tz);
      // L'heure UTC fournie doit correspondre à l'heure locale (contrôle du changement d'heure).
      if (c.occurredAt_utc && Date.parse(c.occurredAt_utc) !== calcule)
        throw new Error(`${j.date} n° ${c.numero} : ${c.heure_locale} ne correspond pas à ${c.occurredAt_utc} dans le fuseau ${tz}`);
      const connus: string[] = [...CONTEXTES, 'autre'];
      const contexte = c.contexte && connus.includes(c.contexte) ? (c.contexte as ContexteCigarette) : undefined;
      if (c.contexte && !contexte) nonImporte.push(`${j.date} n° ${c.numero} : contexte « ${c.contexte} » inconnu de l’app (gardé en note).`);
      const note = [c.contexte && !contexte ? c.contexte : null, c.note].filter(Boolean).join(' · ').slice(0, 200);
      ajouter(`src-${j.date}-c${String(c.numero).padStart(2, '0')}`, 'CigaretteFumee', new Date(calcule).toISOString(), {
        journee: j.date,
        origine: ORIGINE_SOURCE,
        ...(estApprox(c.precision) ? { precision: 'approximative' } : {}),
        ...(contexte ? { contexte } : {}),
        ...(note ? { note } : {}),
      });
    }
    if (sansHeure.length > 0)
      ajouter(`src-${j.date}-cigarettes-sans-heure`, 'AgregatSansHeure', arreteLe ?? finDeJour(j.date), {
        journee: j.date,
        nature: 'cigarettes',
        nombre: sansHeure.length,
        origine: ORIGINE_SOURCE,
        note: `Cigarettes n° ${sansHeure.join(', ')} : heure non notée dans le journal.`,
      });

    // Envies : des comptes, jamais converties en envies résistées sans confirmation.
    const e = j.envies ?? {};
    const num = (k: string) => (typeof e[k] === 'number' ? (e[k] as number) : undefined);
    const nonConc = num('episodes_non_concretises_sur_le_moment');
    const devenues = num('episode_prolonge_abouti_a_cigarette') ?? num('devenues_cigarettes');
    const minimum = num('signalements_minimum');
    const total = num('signalements') ?? minimum ?? ((nonConc ?? 0) + (devenues ?? 0) || undefined);
    if (total)
      ajouter(`src-${j.date}-envies-signalees`, 'AgregatSansHeure', arreteLe ?? finDeJour(j.date), {
        journee: j.date,
        nature: 'envies-signalees',
        nombre: total,
        origine: ORIGINE_SOURCE,
        ...(minimum !== undefined ? { auMoins: true } : {}),
        ...(devenues !== undefined ? { devenuesCigarettes: devenues } : {}),
        ...(nonConc !== undefined ? { nonConcretiseesSurLeMoment: nonConc } : {}),
      });

    for (const [i, p] of (j.substituts ?? []).entries()) {
      const [jour, hm] = p.heure_locale.split('T') as [LocalDate, string];
      const a = new Date(zonedInstant(jour, hm, tz)).toISOString();
      const prov = { journee: j.date, origine: ORIGINE_SOURCE, ...(estApprox(p.precision) ? { precision: 'approximative' } : {}) };
      if (p.type === 'PatchRetire') ajouter(`src-${j.date}-patch-${i + 1}-retrait`, 'PatchRetire', a, prov);
      else ajouter(`src-${j.date}-patch-${i + 1}-pose`, 'PatchPose', a, { ...prov, dosageMg: p.dosageMg ?? 21, dureePortHeures: p.dureePortHeures ?? 24 });
    }
  }

  const tous = [...originaux, ...events];
  valider(tous, 2);
  const dates = src.historique.map((j) => j.date).sort();
  return {
    version: 2,
    meta: {
      type: 'migration',
      source: ORIGINE_SOURCE,
      periode: { du: dates[0]!, au: dates[dates.length - 1]! },
      ...(arreteLe ? { arreteLe } : {}),
      attendu,
      nonImporte: [...nonImporte, 'cafés, sommeil et informations médicales du journal : hors périmètre de l’app.'],
    },
    events: tous,
  };
}

/* ------------------------------------------------------------------ */
/* Aperçu                                                               */
/* ------------------------------------------------------------------ */

/** Une cigarette du journal à moins de ce délai d'une saisie de l'app est proposée au rapprochement. */
export const FENETRE_CANDIDATS_MINUTES = 120;
/** Envies et patchs : même saisie si moins de 15 min d'écart (même type). */
const FENETRE_DOUBLON_MINUTES = 15;

export interface CandidatJournal {
  id: string;
  heure: Instant;
  ecartMinutes: number;
  contexte: string | null;
  approximative: boolean;
}

/** Saisie de l'app à rapprocher (ou non) d'une cigarette du journal : décision de l'utilisateur. */
export interface Divergence {
  appId: string;
  jour: LocalDate;
  heureApp: Instant;
  contexteApp: string | null;
  candidats: CandidatJournal[];
}

export type ChoixDivergence = { action: 'meme'; journalId: string; garder: 'app' | 'journal' } | { action: 'distinctes' };
export type Choix = Readonly<Record<string, ChoixDivergence>>;

export interface LigneJourApercu {
  jour: LocalDate;
  avant: number;
  apres: number;
  ajoutees: number;
  sansHeure: number;
  exactes: number;
  approximatives: number;
  enviesResistees: number;
  enviesSignalees: number;
  attendu: number | null;
  partielle: string | null;
  enCours: boolean;
}

export interface Apercu {
  meta: MetaMigration | null;
  version: 1 | 2;
  /** Nombre d'événements du journal au moment de l'aperçu (contrôle avant écriture). */
  empreinte: number;
  /** Par type d'événement : présents dans le fichier, à ajouter, déjà présents. */
  parType: Record<string, { fichier: number; ajoutes: number; ignores: number }>;
  divergences: Divergence[];
  /** Anomalies indépendantes des choix. */
  anomalies: string[];
  /** Événements à ajouter, avant les choix (cigarettes du journal comprises). */
  aAjouter: DomainEvent[];
  bloquant: string | null;
}

export interface Simulation {
  jours: LigneJourApercu[];
  /** Anomalies qui dépendent des choix (totaux, cigarettes rapprochées…). */
  anomalies: string[];
  /** Divergences encore sans décision. */
  restantes: number;
  /** Choix incohérents (même passage du journal choisi deux fois…). */
  erreurs: string[];
  evenements: DomainEvent[];
}

const heure = (t: Instant, tz: string) =>
  new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: tz }).format(t).replace(':', ' h ');
const jourCourt = (j: LocalDate) => `${j.slice(8, 10)}/${j.slice(5, 7)}`;
const normal = (t: string) => t.trim().toLocaleLowerCase('fr-FR');
const instant = (e: DomainEvent) => Date.parse(e.occurredAt);
const signe = (minutes: number) => `${minutes >= 0 ? '+' : '−'}${Math.abs(minutes / 60)}`;
export const idRapprochement = (journalId: string) => `${journalId}-rapprochement`;

/** Événement du fichier venant de l'app (sauvegarde d'origine) plutôt que de la source importée. */
const estOriginal = (e: DomainEvent) => e.source !== 'import';

export function analyserImport(existants: readonly DomainEvent[], fichier: FichierDeclic, tz: string): Apercu {
  const idsExistants = new Set(existants.map((e) => e.id));
  const parType: Apercu['parType'] = {};
  const compter = (type: string, champ: 'fichier' | 'ajoutes' | 'ignores') => {
    parType[type] ??= { fichier: 0, ajoutes: 0, ignores: 0 };
    parType[type][champ]++;
  };
  const anomalies: string[] = [];
  for (const e of fichier.events) compter(e.type, 'fichier');

  // Saisies d'origine absentes du téléphone (nouveau téléphone) : elles rejoignent la base.
  const originauxNouveaux = fichier.events.filter((e) => estOriginal(e) && !idsExistants.has(e.id));
  const base = [...existants, ...originauxNouveaux];
  const etatBase = rejouer(base, tz);
  const vide: Apercu = { meta: fichier.meta, version: fichier.version, empreinte: existants.length, parType, divergences: [], anomalies, aAjouter: [], bloquant: null };
  if (!etatBase) return { ...vide, bloquant: 'Aucun profil sur ce téléphone ni dans le fichier : crée ton profil avant d’importer un historique.' };

  // 1. Doublons exacts (fichier déjà importé, saisies d'origine déjà présentes, cigarettes déjà rapprochées).
  let candidats: DomainEvent[] = [];
  for (const e of fichier.events) {
    if (estOriginal(e)) {
      if (idsExistants.has(e.id)) compter(e.type, 'ignores');
      continue;
    }
    if (idsExistants.has(e.id) || idsExistants.has(idRapprochement(e.id))) {
      compter(e.type, 'ignores');
      continue;
    }
    if (e.type === 'ProfilCree' || e.type === 'PlanDemarre' || e.type === 'SaisieAnnulee') {
      compter(e.type, 'ignores');
      anomalies.push(`${e.type} dans la source : ignoré (le profil et le plan de ce téléphone sont conservés).`);
      continue;
    }
    candidats.push(e);
  }

  // 2. Contextes : un libellé déjà connu réutilise le contexte existant.
  const remap = new Map<string, ContexteCigarette>();
  candidats = candidats.filter((e) => {
    if (e.type !== 'ContexteAjoute') return true;
    const existant = etatBase.contextesPerso.find((c) => normal(c.libelle) === normal(e.payload.libelle));
    if (!existant) return true;
    remap.set(e.payload.cle, existant.cle);
    compter(e.type, 'ignores');
    return false;
  });
  candidats = candidats.map((e) =>
    e.type === 'CigaretteFumee' && e.payload.contexte && remap.has(e.payload.contexte)
      ? { ...e, payload: { ...e.payload, contexte: remap.get(e.payload.contexte)! } }
      : e,
  );
  const persoFichier = candidats.flatMap((e) => (e.type === 'ContexteAjoute' ? [{ cle: e.payload.cle, libelle: e.payload.libelle }] : []));
  const libelle = (c: ContexteCigarette | undefined) => (c ? libelleContexte(c, [...etatBase.contextesPerso, ...persoFichier]) : null);

  // 3. Envies résistées et patchs : même saisie si très proches ; agrégats : un par journée et par nature.
  const retires = new Set<string>();
  for (const type of ['EnvieResistee', 'PatchPose', 'PatchRetire'] as const) {
    const ex = base.filter((x) => x.type === type).map(instant);
    for (const x of candidats.filter((c) => c.type === type))
      if (ex.some((a) => Math.abs(minutesBetween(a, instant(x))) <= FENETRE_DOUBLON_MINUTES)) {
        retires.add(x.id);
        compter(type, 'ignores');
      }
  }
  for (const e of candidats) {
    if (e.type !== 'AgregatSansHeure') continue;
    const deja = etatBase.sansHeure.find((a) => a.jour === e.payload.journee && a.nature === e.payload.nature);
    if (!deja) continue;
    retires.add(e.id);
    compter(e.type, 'ignores');
    if (deja.nombre !== e.payload.nombre)
      anomalies.push(`${jourCourt(e.payload.journee)} : ${deja.nombre} ${e.payload.nature} sans heure déjà présents, la source en annonce ${e.payload.nombre} (non ajoutés).`);
  }
  const importes = candidats.filter((e) => !retires.has(e.id));
  const aAjouter = [...originauxNouveaux, ...importes];
  for (const e of aAjouter) compter(e.type, 'ajoutes');

  // 4. Divergences : chaque saisie de l'app proche d'une cigarette du journal, sans décision automatique.
  const journalCigs = importes.filter((e): e is Extract<DomainEvent, { type: 'CigaretteFumee' }> => e.type === 'CigaretteFumee');
  const divergences: Divergence[] = [];
  for (const app of etatBase.cigarettes) {
    const proches = journalCigs
      .map((e) => ({ e, d: Math.abs(minutesBetween(app.a, instant(e))) }))
      .filter((x) => x.d <= FENETRE_CANDIDATS_MINUTES)
      .sort((x, y) => x.d - y.d);
    if (proches.length === 0) continue;
    divergences.push({
      appId: app.id,
      jour: app.jour,
      heureApp: app.a,
      contexteApp: libelle(app.contexte),
      candidats: proches.map(({ e, d }) => ({
        id: e.id,
        heure: instant(e),
        ecartMinutes: Math.round(d),
        contexte: libelle(e.payload.contexte),
        approximative: e.payload.precision === 'approximative',
      })),
    });
  }
  divergences.sort((x, y) => x.heureApp - y.heureApp);

  // 5. Anomalies indépendantes des choix.
  const meta = fichier.meta;
  for (const [jour, a] of Object.entries(meta?.attendu ?? {})) {
    if (a.partielle) anomalies.push(`${jourCourt(jour)} : journée partielle (${a.partielle}) — ne pas la comparer à une journée complète.`);
    if (a.enCours) anomalies.push(`${jourCourt(jour)} : journée en cours au moment de l’export${meta?.arreteLe ? ` (${heure(Date.parse(meta.arreteLe), tz)})` : ''}.`);
    const debut = zonedInstant(jour, '00:00', tz);
    const fin = zonedInstant(jour, '23:59', tz);
    if (offsetMinutes(debut, tz) !== offsetMinutes(fin, tz))
      anomalies.push(
        `${jourCourt(jour)} : changement d’heure (UTC${signe(offsetMinutes(debut, tz))} puis UTC${signe(offsetMinutes(fin, tz))}). Chaque heure est convertie avec son propre décalage ; les intervalles sont calculés en temps réel.`,
      );
  }
  for (const e of importes)
    if (e.type === 'AgregatSansHeure' && e.payload.nature === 'cigarettes')
      anomalies.push(`${jourCourt(e.payload.journee)} : ${e.payload.nombre} cigarettes sans heure connue, comptées dans le total, pas dans les intervalles ni les heures à risque.`);
  if (divergences.length > 0) anomalies.push(`${divergences.length} saisie(s) de l’app à rapprocher manuellement du journal avant l’import.`);
  for (const n of meta?.nonImporte ?? []) anomalies.push(`Non importé : ${n}`);
  if (aAjouter.length === 0) anomalies.unshift('Rien de nouveau à ajouter : ce fichier a déjà été importé.');

  return { ...vide, divergences, anomalies, aAjouter };
}

/** Événements à écrire selon les choix (ajouts uniquement). */
function evenements(apercu: Apercu, choix: Choix, tz: string): DomainEvent[] {
  const fusionnes = new Set<string>();
  const corrections: DomainEvent[] = [];
  for (const d of apercu.divergences) {
    const c = choix[d.appId];
    if (!c || c.action !== 'meme') continue;
    const j = apercu.aAjouter.find((e) => e.id === c.journalId);
    if (!j || j.type !== 'CigaretteFumee' || fusionnes.has(j.id)) continue;
    fusionnes.add(j.id);
    // Correction de la saisie de l'app : heure et contexte du journal si choisis ; sinon simple
    // marque de rapprochement (le contexte du journal complète une saisie qui n'en avait pas).
    const contexte = c.garder === 'journal' || !d.contexteApp ? j.payload.contexte : undefined;
    corrections.push({
      id: idRapprochement(j.id),
      type: 'CigaretteCorrigee',
      schemaVersion: 1,
      occurredAt: j.occurredAt,
      tz,
      source: 'import',
      payload: { evenementId: d.appId, ...(contexte ? { contexte } : {}), ...(c.garder === 'journal' ? { occurredAt: j.occurredAt } : {}) },
    });
  }
  return [...apercu.aAjouter.filter((e) => !fusionnes.has(e.id)), ...corrections];
}

/** Totaux et anomalies selon les choix, sans rien écrire. */
export function simulerImport(existants: readonly DomainEvent[], apercu: Apercu, choix: Choix, tz: string): Simulation {
  const evs = evenements(apercu, choix, tz);
  const etatAvant = rejouer(existants, tz);
  const etatApres = rejouer([...existants, ...evs], tz);
  if (!etatApres) return { jours: [], anomalies: [], restantes: 0, erreurs: apercu.bloquant ? [apercu.bloquant] : [], evenements: [] };
  const meta = apercu.meta;
  const fin = meta?.arreteLe ? Date.parse(meta.arreteLe) : Math.max(...[...existants, ...evs].map(instant));
  const avant = new Map((etatAvant ? historiqueJournees(etatAvant, fin, tz, 400) : []).map((j) => [j.jour, j]));
  const apres = historiqueJournees(etatApres, fin, tz, 400);
  const ajoutIds = new Set(evs.map((e) => e.id));
  const dansPeriode = (j: LocalDate) => (meta ? j >= meta.periode.du && j <= meta.periode.au : evs.some((e) => localDateOf(instant(e), tz) === j));
  const jours: LigneJourApercu[] = apres
    .filter((j) => dansPeriode(j.jour))
    .sort((x, y) => x.jour.localeCompare(y.jour))
    .map((j) => {
      const att = meta?.attendu?.[j.jour];
      const cigs = etatApres.cigarettes.filter((c) => c.jour === j.jour);
      return {
        jour: j.jour,
        avant: avant.get(j.jour)?.total ?? 0,
        apres: j.total,
        ajoutees: cigs.filter((c) => ajoutIds.has(c.id)).length,
        sansHeure: j.sansHeure,
        exactes: cigs.filter((c) => !c.precision).length,
        approximatives: cigs.filter((c) => c.precision === 'approximative').length,
        enviesResistees: j.envies,
        enviesSignalees: j.enviesSignalees,
        attendu: att?.cigarettes ?? null,
        partielle: att?.partielle ?? null,
        enCours: att?.enCours ?? false,
      };
    });

  const anomalies: string[] = [];
  for (const j of jours)
    if (j.attendu !== null && j.attendu !== j.apres) anomalies.push(`${jourCourt(j.jour)} : ${j.apres} cigarettes avec ces choix, la source en annonce ${j.attendu}.`);
  // Journée déclarée par la source différente de la règle de l'app (RM-14).
  const triees = [...etatApres.cigarettes].sort((x, y) => x.a - y.a);
  const regle = etiqueterCigarettes(triees.map((c) => c.a), tz, SEUIL_NUIT_MINUTES);
  triees.forEach((c, i) => {
    const e = evs.find((x) => x.id === c.id);
    if (e?.type === 'CigaretteFumee' && e.payload.journee && e.payload.journee !== regle[i])
      anomalies.push(
        `${heure(c.a, tz)} du ${jourCourt(localDateOf(c.a, tz))} rattachée au ${jourCourt(e.payload.journee)} comme dans la source ; la règle de l’app (pause de moins de 5 h) l’aurait rattachée au ${jourCourt(regle[i]!)}.`,
      );
  });
  for (let i = 1; i < triees.length; i++) {
    const d = minutesBetween(triees[i - 1]!.a, triees[i]!.a);
    if (d < 5 && (ajoutIds.has(triees[i]!.id) || ajoutIds.has(triees[i - 1]!.id)))
      anomalies.push(`${jourCourt(triees[i]!.jour)} : ${heure(triees[i - 1]!.a, tz)} puis ${heure(triees[i]!.a, tz)} (${Math.round(d)} min) — vérifie qu’il s’agit bien de deux cigarettes.`);
  }
  if (etatApres.plan) {
    const j0 = etatApres.plan.input.dateDebut;
    const avantPlan = etatApres.cigarettes.filter((c) => c.jour === j0 && c.a < etatApres.plan!.demarreLe).length;
    if (avantPlan > 0 && dansPeriode(j0))
      anomalies.push(
        `${jourCourt(j0)} : ${avantPlan} cigarettes avant le démarrage du plan (${heure(etatApres.plan.demarreLe, tz)}) : comptées dans le total réel de la journée, pas dans le quota.`,
      );
  }

  const erreurs: string[] = [];
  const pris = new Map<string, string>();
  for (const d of apercu.divergences) {
    const c = choix[d.appId];
    if (c?.action !== 'meme') continue;
    if (!d.candidats.some((x) => x.id === c.journalId)) erreurs.push(`${heure(d.heureApp, tz)} : cigarette du journal hors des candidats proposés.`);
    if (pris.has(c.journalId)) erreurs.push(`La même cigarette du journal est choisie pour ${pris.get(c.journalId)} et ${heure(d.heureApp, tz)}.`);
    pris.set(c.journalId, heure(d.heureApp, tz));
  }
  return { jours, anomalies, restantes: apercu.divergences.filter((d) => !choix[d.appId]).length, erreurs, evenements: evs };
}

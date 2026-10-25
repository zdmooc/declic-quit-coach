/**
 * Composition racine : assemble les adaptateurs (SQLite, notifications, coach IA) autour
 * des cas d'usage `Declic` (ADR-0002). Aucune règle métier ici.
 */

import { getRandomValues } from 'expo-crypto';
import * as SQLite from 'expo-sqlite';
import { Declic } from '../../application/declic';
import { CoachHttp } from '../../adapters/coachHttp';
import { MemoryNotifier, SystemClock, UuidV7Generator } from '../../adapters/memory';
import { modulesNotificationsManquants } from '../../adapters/notificationsDisponibles';
import { ReglagesLocaux } from '../../adapters/reglagesLocaux';
import { SqliteEventStore } from '../../adapters/sqlite';
import type { ContenuSante, ReferencePharma } from '../../domain';
import type { Notifier } from '../../ports';
import pharma from '../../../config/pharma-reference.json';
import sante from '../../../config/health-milestones.json';

export type ModuleNotifications = typeof import('../../adapters/expoNotifications');

export interface Application {
  declic: Declic;
  clock: SystemClock;
  /** `null` si les notifications sont indisponibles (Expo Go trop ancien, par exemple). */
  notifications: ModuleNotifications | null;
  locaux: ReglagesLocaux;
  /** Adresse du relais du coach IA, si configuré. */
  urlCoach: string | null;
}

/** Charge expo-notifications seulement si ses modules natifs sont présents (sinon l'app planterait). */
async function chargerNotifications(): Promise<ModuleNotifications | null> {
  const manquants = modulesNotificationsManquants();
  if (manquants.length > 0) {
    console.warn(`Notifications désactivées, modules natifs absents : ${manquants.join(', ')}`);
    return null;
  }
  try {
    const mod = await import('../../adapters/expoNotifications');
    // Un refus de permission ne bloque pas l'app : les notifications ne seront pas programmées.
    await mod.configurerNotifications().catch(() => false);
    return mod;
  } catch (e) {
    console.warn('Notifications désactivées', e);
    return null;
  }
}

// Journal enregistré dans SQLite sur le téléphone (non chiffré pour l'instant, voir adapters/sqlite.ts).
// Notifications locales programmées sur le téléphone (ADR-0007).
export async function creerApplication(): Promise<Application> {
  const notifications = await chargerNotifications();
  const notifier: Notifier = notifications ? new notifications.ExpoNotifier() : new MemoryNotifier();
  const clock = new SystemClock();
  const db = await SQLite.openDatabaseAsync('declic.db');
  const store = await SqliteEventStore.ouvrir(db);
  const locaux = await ReglagesLocaux.ouvrir(db);
  const configCoach = await locaux.configCoach();
  const declic = new Declic({
    store,
    clock,
    ids: new UuidV7Generator((b) => {
      getRandomValues(b);
    }),
    notifier,
    referencePharma: pharma as ReferencePharma,
    contenuSante: sante as ContenuSante,
    ...(configCoach ? { coachIa: new CoachHttp(configCoach.url, configCoach.jeton) } : {}),
  });
  await declic.replanifierNotifications();
  return { declic, clock, notifications, locaux, urlCoach: configCoach?.url ?? null };
}

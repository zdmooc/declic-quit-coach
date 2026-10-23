/**
 * Adapter `Notifier` sur expo-notifications : notifications LOCALES programmées sur le téléphone
 * (ADR-0007). Aucun serveur. Fonctionne dans Expo Go (seules les notifications push en sont exclues).
 */

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import type { Candidate } from '../domain';
import type { Notifier } from '../ports';

export const CANAL = 'declic';
/** Catégorie avec les actions « J'ai fumé » / « J'ai résisté » (sans « : » ni « - »). */
export const CATEGORIE_SAISIE = 'saisie';
export const ACTION_FUME = 'fume';
export const ACTION_RESISTE = 'resiste';

/** Catégories qui proposent les boutons d'action. */
const AVEC_ACTIONS = new Set<Candidate['categorie']>(['rythme', 'plan']);

/** À appeler une fois au démarrage : affichage au premier plan, canal Android, actions, permission. */
export async function configurerNotifications(): Promise<boolean> {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CANAL, {
      name: 'Déclic',
      // eslint-disable-next-line import/namespace -- énumération réexportée par « export * », non résolue par le plugin
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
  await Notifications.setNotificationCategoryAsync(CATEGORIE_SAISIE, [
    { identifier: ACTION_FUME, buttonTitle: 'J’ai fumé', options: { opensAppToForeground: true } },
    { identifier: ACTION_RESISTE, buttonTitle: 'J’ai résisté', options: { opensAppToForeground: true } },
  ]);
  return demanderPermission();
}

export async function demanderPermission(): Promise<boolean> {
  const actuel = await Notifications.getPermissionsAsync();
  if (estAutorise(actuel)) return true;
  if (!actuel.canAskAgain) return false;
  return estAutorise(await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } }));
}

function estAutorise(p: Notifications.NotificationPermissionsStatus): boolean {
  if (Platform.OS === 'ios') {
    const s = p.ios?.status;
    // eslint-disable-next-line import/namespace -- énumération réexportée par « export * », non résolue par le plugin
    const { AUTHORIZED, PROVISIONAL } = Notifications.IosAuthorizationStatus;
    return s === AUTHORIZED || s === PROVISIONAL;
  }
  return p.granted;
}

export class ExpoNotifier implements Notifier {
  /** Dernière liste programmée, pour éviter de tout reprogrammer quand rien n'a changé. */
  private signature = '';

  async remplacer(planifiees: readonly Candidate[]): Promise<void> {
    const signature = planifiees.map((c) => `${c.cle}@${c.a}`).join('|');
    if (signature === this.signature) return;
    const autorise = estAutorise(await Notifications.getPermissionsAsync());
    await Notifications.cancelAllScheduledNotificationsAsync();
    this.signature = '';
    if (!autorise) return;
    const maintenant = Date.now();
    for (const c of planifiees) {
      if (c.a <= maintenant) continue;
      await Notifications.scheduleNotificationAsync({
        identifier: c.cle,
        content: {
          title: c.titre,
          body: c.corps,
          data: { cle: c.cle, categorie: c.categorie },
          ...(AVEC_ACTIONS.has(c.categorie) ? { categoryIdentifier: CATEGORIE_SAISIE } : {}),
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(c.a), channelId: CANAL },
      });
    }
    this.signature = signature;
  }
}

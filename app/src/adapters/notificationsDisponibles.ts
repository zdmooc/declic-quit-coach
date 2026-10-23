/**
 * Vérifie, SANS charger expo-notifications, que les modules natifs dont il a besoin sont présents.
 *
 * Pourquoi : si la version d'Expo Go installée est plus ancienne que la bibliothèque JavaScript,
 * un module natif manque et le simple chargement d'expo-notifications fait planter l'app
 * (« Cannot find native module … »). Dans ce cas, l'app fonctionne sans notifications (résilience D11).
 */

import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

const COMMUNS = [
  'ExpoBackgroundNotificationTasksModule',
  'ExpoBadgeModule',
  'ExpoNotificationCategoriesModule',
  'ExpoNotificationChannelGroupManager',
  'ExpoNotificationChannelManager',
  'ExpoNotificationPermissionsModule',
  'ExpoNotificationPresenter',
  'ExpoNotificationScheduler',
  'ExpoNotificationsEmitter',
  'ExpoNotificationsHandlerModule',
  'ExpoPushTokenManager',
  'NotificationsServerRegistrationModule',
];

export function modulesNotificationsManquants(): string[] {
  const requis = Platform.OS === 'android' ? [...COMMUNS, 'ExpoTopicSubscriptionModule'] : COMMUNS;
  return requis.filter((nom) => requireOptionalNativeModule(nom) === null);
}

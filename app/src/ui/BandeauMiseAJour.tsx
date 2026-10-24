import { Pressable, StyleSheet, Text } from 'react-native';
import * as Updates from 'expo-updates';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { couleurs, espace } from './theme';

/**
 * Mises à jour automatiques (EAS Update) : la nouvelle version est téléchargée en arrière-plan
 * au lancement ; ce bandeau propose de redémarrer pour l'appliquer tout de suite
 * (sinon elle s'applique au prochain lancement). Invisible dans Expo Go et en développement.
 */
export function BandeauMiseAJour() {
  const { isUpdatePending } = Updates.useUpdates();
  const insets = useSafeAreaInsets();
  if (!Updates.isEnabled || !isUpdatePending) return null;
  return (
    <Pressable style={[styles.bandeau, { paddingTop: insets.top + espace(2) }]} onPress={() => void Updates.reloadAsync()} accessibilityRole="button">
      <Text style={styles.texte}>Nouvelle version de Déclic prête · </Text>
      <Text style={styles.action}>Redémarrer</Text>
    </Pressable>
  );
}

/** Version affichée dans les réglages (utile pour le support). */
export function libelleVersion(version: string): string {
  if (!Updates.isEnabled) return `Version ${version} (développement)`;
  const maj = Updates.updateId && !Updates.isEmbeddedLaunch ? ` · mise à jour ${Updates.updateId.slice(0, 8)}` : '';
  return `Version ${version}${maj}`;
}

const styles = StyleSheet.create({
  // Superposé en haut de l'écran, sous la barre d'état (ne décale pas la page).
  bandeau: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    elevation: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    backgroundColor: couleurs.vert,
    paddingVertical: espace(2),
    paddingHorizontal: espace(4),
  },
  texte: { color: '#FFFFFF', fontSize: 14 },
  action: { color: '#FFFFFF', fontSize: 14, fontWeight: '800', textDecorationLine: 'underline' },
});

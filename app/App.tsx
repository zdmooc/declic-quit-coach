import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { getRandomValues } from 'expo-crypto';
import { Declic, type NouveauProfil } from './src/application/declic';
import { InMemoryEventStore, MemoryNotifier, SystemClock, UuidV7Generator } from './src/adapters/memory';
import type { ContenuSante, ReferencePharma, TableauDeBord } from './src/domain';
import { DashboardScreen } from './src/ui/DashboardScreen';
import { OnboardingScreen } from './src/ui/OnboardingScreen';
import { couleurs } from './src/ui/theme';
import pharma from './config/pharma-reference.json';
import sante from './config/health-milestones.json';

// Prototype : journal en mémoire (perdu à la fermeture) et notifications non encore branchées.
// Prochaines étapes : SQLite chiffré et expo-notifications (voir docs/architecture/03 et 04).
function creerApplication() {
  const clock = new SystemClock();
  return {
    clock,
    declic: new Declic({
      store: new InMemoryEventStore(),
      clock,
      ids: new UuidV7Generator((b) => {
        getRandomValues(b);
      }),
      notifier: new MemoryNotifier(),
      referencePharma: pharma as ReferencePharma,
      contenuSante: sante as ContenuSante,
    }),
  };
}

export default function App() {
  const { declic, clock } = useMemo(creerApplication, []);
  const [chargement, setChargement] = useState(true);
  const [tdb, setTdb] = useState<TableauDeBord | null>(null);

  const rafraichir = useCallback(async () => {
    setTdb(await declic.tableauDeBord());
    setChargement(false);
  }, [declic]);

  useEffect(() => {
    void rafraichir();
    const timer = setInterval(() => void rafraichir(), 30_000);
    return () => clearInterval(timer);
  }, [rafraichir]);

  const agir = (action: () => Promise<unknown>) => async () => {
    await action();
    await rafraichir();
  };

  // Protection contre le double appui : confirmation si la dernière cigarette date de moins de 2 min.
  const onFume = () => {
    const enregistrer = agir(() => declic.enregistrerCigarette());
    const depuis = tdb?.depuisDerniereMinutes;
    if (depuis === null || depuis === undefined || depuis >= 2) {
      void enregistrer();
      return;
    }
    Alert.alert('Encore une ?', 'Tu en as enregistré une il y a moins de 2 minutes. On compte bien une cigarette de plus ?', [
      { text: 'Non, erreur', style: 'cancel' },
      { text: 'Oui, compter', onPress: () => void enregistrer() },
    ]);
  };

  if (chargement) {
    return (
      <View style={styles.centre}>
        <ActivityIndicator color={couleurs.vert} />
      </View>
    );
  }

  return (
    <View style={styles.racine}>
      <StatusBar style="dark" />
      {tdb === null ? (
        <OnboardingScreen onValider={(p: NouveauProfil) => agir(() => declic.creerProfil(p))()} />
      ) : (
        <DashboardScreen
          tdb={tdb}
          tz={clock.timeZone()}
          onFume={onFume}
          onResiste={agir(() => declic.enregistrerEnvieResistee())}
          onAnnuler={agir(() => declic.annulerDerniereSaisie())}
          onPalier={agir(() => declic.demanderPalier())}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  racine: { flex: 1, backgroundColor: couleurs.fond },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: couleurs.fond },
});

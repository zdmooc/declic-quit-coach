import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { getRandomValues } from 'expo-crypto';
import * as SQLite from 'expo-sqlite';
import { Declic, type NouveauProfil } from './src/application/declic';
import { MemoryNotifier, SystemClock, UuidV7Generator } from './src/adapters/memory';
import { SqliteEventStore } from './src/adapters/sqlite';
import type { ContenuSante, ContexteCigarette, ReferencePharma, TableauDeBord } from './src/domain';
import { ContexteSheet } from './src/ui/ContexteSheet';
import { DashboardScreen } from './src/ui/DashboardScreen';
import { OnboardingScreen } from './src/ui/OnboardingScreen';
import { couleurs } from './src/ui/theme';
import pharma from './config/pharma-reference.json';
import sante from './config/health-milestones.json';

interface Application {
  declic: Declic;
  clock: SystemClock;
}

// Journal enregistré dans SQLite sur le téléphone (non chiffré dans Expo Go, voir adapters/sqlite.ts).
// Notifications : calculées mais pas encore programmées (expo-notifications : prochaine étape).
async function creerApplication(): Promise<Application> {
  const clock = new SystemClock();
  const db = await SQLite.openDatabaseAsync('declic.db');
  const store = await SqliteEventStore.ouvrir(db);
  const declic = new Declic({
    store,
    clock,
    ids: new UuidV7Generator((b) => {
      getRandomValues(b);
    }),
    notifier: new MemoryNotifier(),
    referencePharma: pharma as ReferencePharma,
    contenuSante: sante as ContenuSante,
  });
  await declic.replanifierNotifications();
  return { declic, clock };
}

export default function App() {
  const [app, setApp] = useState<Application | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [chargement, setChargement] = useState(true);
  const [tdb, setTdb] = useState<TableauDeBord | null>(null);
  /** Cigarette qui vient d'être enregistrée et dont on demande le contexte. */
  const [aPreciser, setAPreciser] = useState<string | null>(null);

  useEffect(() => {
    creerApplication()
      .then(setApp)
      .catch((e: unknown) => setErreur(e instanceof Error ? e.message : String(e)));
  }, []);

  const rafraichir = useCallback(async () => {
    if (!app) return;
    setTdb(await app.declic.tableauDeBord());
    setChargement(false);
  }, [app]);

  useEffect(() => {
    void rafraichir();
    const timer = setInterval(() => void rafraichir(), 30_000);
    return () => clearInterval(timer);
  }, [rafraichir]);

  if (erreur) {
    return (
      <View style={styles.centre}>
        <Text style={styles.erreur}>Impossible d’ouvrir les données : {erreur}</Text>
      </View>
    );
  }
  if (!app || chargement) {
    return (
      <View style={styles.centre}>
        <ActivityIndicator color={couleurs.vert} />
      </View>
    );
  }
  const { declic, clock } = app;

  const agir = (action: () => Promise<unknown>) => async () => {
    await action();
    await rafraichir();
  };

  // Protection contre le double appui : confirmation si la dernière cigarette date de moins de 2 min.
  const onFume = () => {
    const enregistrer = async () => {
      const id = await declic.enregistrerCigarette();
      await rafraichir();
      setAPreciser(id);
    };
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

  const onPreciser = async (precision: { contexte?: ContexteCigarette; ilYaMinutes?: number }) => {
    const id = aPreciser;
    setAPreciser(null);
    if (id) {
      await declic.preciserCigarette(id, precision);
      await rafraichir();
    }
  };

  const onEffacer = () =>
    Alert.alert('Effacer toutes mes données ?', 'Ton profil, ton historique et ton plan seront supprimés de ce téléphone.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Effacer', style: 'destructive', onPress: () => void agir(() => declic.effacerToutesLesDonnees())() },
    ]);

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
          onDemarrerPlan={agir(() => declic.demarrerPlan())}
          onEffacer={onEffacer}
        />
      )}
      <ContexteSheet visible={aPreciser !== null} onChoisir={(p) => void onPreciser(p)} />
    </View>
  );
}

const styles = StyleSheet.create({
  racine: { flex: 1, backgroundColor: couleurs.fond },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: couleurs.fond, padding: 24 },
  erreur: { color: couleurs.encre, fontSize: 16, textAlign: 'center' },
});

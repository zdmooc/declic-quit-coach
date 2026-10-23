import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, StyleSheet, Text, View } from 'react-native';
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
import { getRandomValues } from 'expo-crypto';
import * as SQLite from 'expo-sqlite';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Declic, type NouveauProfil } from './src/application/declic';
import { ACTION_FUME, ACTION_RESISTE, configurerNotifications, ExpoNotifier } from './src/adapters/expoNotifications';
import { SystemClock, UuidV7Generator } from './src/adapters/memory';
import { SqliteEventStore } from './src/adapters/sqlite';
import type { ContenuSante, ReferencePharma, TableauDeBord } from './src/domain';
import { ContexteSheet, type Precision } from './src/ui/ContexteSheet';
import { DashboardScreen } from './src/ui/DashboardScreen';
import { OnboardingScreen } from './src/ui/OnboardingScreen';
import { SosEnvie } from './src/ui/SosEnvie';
import { couleurs } from './src/ui/theme';
import pharma from './config/pharma-reference.json';
import sante from './config/health-milestones.json';

interface Application {
  declic: Declic;
  clock: SystemClock;
}

// Journal enregistré dans SQLite sur le téléphone (non chiffré dans Expo Go, voir adapters/sqlite.ts).
// Notifications locales programmées sur le téléphone (ADR-0007).
async function creerApplication(): Promise<Application> {
  // Un refus de permission ne bloque pas l'app : les notifications ne seront simplement pas programmées.
  await configurerNotifications().catch(() => false);
  const clock = new SystemClock();
  const db = await SQLite.openDatabaseAsync('declic.db');
  const store = await SqliteEventStore.ouvrir(db);
  const declic = new Declic({
    store,
    clock,
    ids: new UuidV7Generator((b) => {
      getRandomValues(b);
    }),
    notifier: new ExpoNotifier(),
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
  const [sos, setSos] = useState(false);
  /** Réponses aux notifications déjà traitées (une action ne doit compter qu'une fois). */
  const reponsesTraitees = useRef(new Set<string>());

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

  // Retour au premier plan : on recalcule l'écran et on reprogramme les notifications.
  useEffect(() => {
    if (!app) return;
    const sub = AppState.addEventListener('change', (etat) => {
      if (etat === 'active') void app.declic.replanifierNotifications().then(rafraichir);
    });
    return () => sub.remove();
  }, [app, rafraichir]);

  // Boutons « J'ai fumé » / « J'ai résisté » dans les notifications (et ouverture à froid).
  useEffect(() => {
    if (!app) return;
    const traiter = async (r: Notifications.NotificationResponse) => {
      const cle = `${r.notification.request.identifier}|${r.actionIdentifier}|${r.notification.date}`;
      if (reponsesTraitees.current.has(cle)) return;
      reponsesTraitees.current.add(cle);
      Notifications.clearLastNotificationResponse();
      if (r.actionIdentifier === ACTION_FUME) {
        const id = await app.declic.enregistrerCigarette(undefined, 'notification');
        setAPreciser(id);
      } else if (r.actionIdentifier === ACTION_RESISTE) {
        await app.declic.enregistrerEnvieResistee(undefined, 'notification');
      }
      await rafraichir();
    };
    const derniere = Notifications.getLastNotificationResponse();
    if (derniere) void traiter(derniere);
    const sub = Notifications.addNotificationResponseReceivedListener((r) => void traiter(r));
    return () => sub.remove();
  }, [app, rafraichir]);

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

  const onPreciser = async ({ nouveauContexte, ...precision }: Precision) => {
    const id = aPreciser;
    setAPreciser(null);
    if (!id) return;
    // Un contexte saisi est d'abord ajouté à la liste, puis attribué à la cigarette.
    const contexte = nouveauContexte ? await declic.ajouterContexte(nouveauContexte) : precision.contexte;
    await declic.preciserCigarette(id, { ...precision, ...(contexte ? { contexte } : {}) });
    await rafraichir();
  };

  const onEffacer = () =>
    Alert.alert('Effacer toutes mes données ?', 'Ton profil, ton historique et ton plan seront supprimés de ce téléphone.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Effacer', style: 'destructive', onPress: () => void agir(() => declic.effacerToutesLesDonnees())() },
    ]);

  return (
    <SafeAreaProvider>
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
          onEcheance={() => void rafraichir()}
          onSos={() => setSos(true)}
        />
      )}
      {sos && (
      <SosEnvie
        raisons={tdb?.raisons ?? []}
        economieAnCents={tdb?.projection.parAnCents ?? 0}
        onResiste={() => {
          setSos(false);
          void agir(() => declic.enregistrerEnvieResistee('respiration'))();
        }}
        onFermer={() => setSos(false)}
        onAjouterRaison={(texte) => void agir(() => declic.ajouterRaison(texte))()}
      />
      )}
      <ContexteSheet
        visible={aPreciser !== null}
        contextesPerso={tdb?.contextesPerso ?? []}
        onChoisir={(p) => void onPreciser(p)}
      />
    </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  racine: { flex: 1, backgroundColor: couleurs.fond },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: couleurs.fond, padding: 24 },
  erreur: { color: couleurs.encre, fontSize: 16, textAlign: 'center' },
});

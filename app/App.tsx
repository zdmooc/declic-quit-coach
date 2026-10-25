import { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { NouveauProfil, Reglages } from './src/application/declic';
import { CoachHttp, normaliserUrlCoach } from './src/adapters/coachHttp';
import type { JourneeHistorique, MessageCoach, ModeCoach, Progres } from './src/domain';
import { effacer, partager, restaurer, sauvegarder } from './src/ui/app/donnees';
import { useApplication } from './src/ui/app/useApplication';
import { BandeauMiseAJour } from './src/ui/BandeauMiseAJour';
import { CoachScreen, ReglageCoach } from './src/ui/CoachScreen';
import { ContexteSheet, type Precision } from './src/ui/ContexteSheet';
import { DashboardScreen } from './src/ui/DashboardScreen';
import { HistoriqueScreen } from './src/ui/HistoriqueScreen';
import { OnboardingScreen } from './src/ui/OnboardingScreen';
import { ProgresScreen } from './src/ui/ProgresScreen';
import { ReglagesScreen } from './src/ui/ReglagesScreen';
import { SosEnvie } from './src/ui/SosEnvie';
import { SubstitutsScreen } from './src/ui/SubstitutsScreen';
import { couleurs } from './src/ui/theme';

/**
 * Racine de l'interface : page principale et écrans ouverts par-dessus.
 * Composition et cycle de vie : `src/ui/app/` ; règles métier : `src/domain/`.
 */
export default function App() {
  /** Cigarette qui vient d'être enregistrée et dont on demande le contexte. */
  const [aPreciser, setAPreciser] = useState<string | null>(null);
  const [sos, setSos] = useState(false);
  const [substituts, setSubstituts] = useState(false);
  const [progresVue, setProgresVue] = useState<{ progres: Progres; mot: MessageCoach | null } | null>(null);
  const [coachMode, setCoachMode] = useState<ModeCoach | null>(null);
  const [urlCoach, setUrlCoach] = useState<string | null | undefined>(undefined);
  const [historique, setHistorique] = useState<JourneeHistorique[] | null>(null);
  const [reglages, setReglages] = useState<Reglages | null>(null);

  const { app, erreur, chargement, tdb, coachDispo, rafraichir } = useApplication({
    cigaretteEnregistree: setAPreciser,
    ouvrirProgres: () => void ouvrirProgres(),
  });

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
  const adresseCoach = urlCoach === undefined ? app.urlCoach : urlCoach;

  /** Exécute une action, puis rafraîchit la page principale. */
  const agir = (action: () => Promise<unknown>) => async () => {
    await action();
    await rafraichir();
  };
  /** Exécute une action depuis un écran secondaire, puis rafraîchit cet écran et la page principale. */
  const depuis = (action: () => Promise<unknown>, rouvrir: () => Promise<void>) =>
    void agir(async () => {
      await action();
      await rouvrir();
    })();

  async function ouvrirProgres() {
    if (!app) return;
    const [progres, mot] = await Promise.all([app.declic.progres(), app.declic.motDuCoach()]);
    if (progres) setProgresVue({ progres, mot });
  }
  const ouvrirHistorique = async () => setHistorique(await declic.historique(60));
  const ouvrirReglages = async () => setReglages(await declic.reglages());

  // Protection contre le double appui : confirmation si la dernière cigarette date de moins de 2 min.
  const onFume = () => {
    const enregistrer = async () => {
      const id = await declic.enregistrerCigarette();
      await rafraichir();
      setAPreciser(id);
    };
    const ecart = tdb?.depuisDerniereMinutes;
    if (ecart === null || ecart === undefined || ecart >= 2) {
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

  const onRestaurer = () =>
    void restaurer(declic, async () => {
      await rafraichir();
      if (reglages) await ouvrirReglages();
    });

  const onEffacer = () =>
    effacer(
      () =>
        void agir(async () => {
          await declic.effacerToutesLesDonnees();
          await app.locaux.effacer();
          declic.brancherCoach(undefined);
          setUrlCoach(null);
          setReglages(null);
          setHistorique(null);
        })(),
    );

  const enregistrerCoach = (saisie: string, jeton: string) =>
    void (async () => {
      const url = normaliserUrlCoach(saisie);
      await app.locaux.definirConfigCoach({ url, jeton });
      declic.brancherCoach(new CoachHttp(url, jeton));
      setUrlCoach(url);
      await rafraichir();
    })();

  return (
    <SafeAreaProvider>
      <View style={styles.racine}>
        <StatusBar style="dark" />
        {tdb === null ? (
          <OnboardingScreen onValider={(p: NouveauProfil) => agir(() => declic.creerProfil(p))()} onRestaurer={onRestaurer} />
        ) : (
          <DashboardScreen
            tdb={tdb}
            tz={clock.timeZone()}
            onFume={onFume}
            onResiste={agir(() => declic.enregistrerEnvieResistee())}
            onAnnuler={agir(() => declic.annulerDerniereSaisie())}
            onPalier={agir(() => declic.demanderPalier())}
            onDemarrerPlan={agir(() => declic.demarrerPlan())}
            onHistorique={() => void ouvrirHistorique()}
            onReglages={() => void ouvrirReglages()}
            onSubstituts={() => setSubstituts(true)}
            onProgres={() => void ouvrirProgres()}
            onEcheance={() => void rafraichir()}
            onSos={() => setSos(true)}
            notificationsIndisponibles={app.notifications === null}
          />
        )}
        {historique && (
          <HistoriqueScreen
            journees={historique}
            tz={clock.timeZone()}
            contextesPerso={tdb?.contextesPerso ?? []}
            onFermer={() => setHistorique(null)}
            onSupprimer={(id) => depuis(() => declic.annulerSaisie(id), ouvrirHistorique)}
            onPreciser={(id, { nouveauContexte, contexte }) =>
              depuis(async () => {
                const c = nouveauContexte ? await declic.ajouterContexte(nouveauContexte) : contexte;
                if (c) await declic.preciserCigarette(id, { contexte: c });
              }, ouvrirHistorique)
            }
          />
        )}
        {substituts && tdb && (
          <SubstitutsScreen
            tdb={tdb}
            tz={clock.timeZone()}
            maintenant={clock.now()}
            onFermer={() => setSubstituts(false)}
            onPoserPatch={(mg, h) => void agir(() => declic.poserPatch(mg, h))()}
            onRetirerPatch={() => void agir(() => declic.retirerPatch())()}
            onPrendre={(forme, mg) => void agir(() => declic.prendreSubstitutOral(forme, mg))()}
          />
        )}
        {reglages && (
          <ReglagesScreen
            reglages={reglages}
            onFermer={() => setReglages(null)}
            onPrix={(p, n) => depuis(() => declic.modifierPrix(p, n), ouvrirReglages)}
            onIntervalle={(m) => depuis(() => declic.modifierIntervalleRecommande(m), ouvrirReglages)}
            onRythme={(st) => depuis(() => declic.modifierRythme(st), ouvrirReglages)}
            onRenommerContexte={(cle, l) => depuis(() => declic.renommerContexte(cle, l), ouvrirReglages)}
            onArchiverContexte={(cle) => depuis(() => declic.archiverContexte(cle), ouvrirReglages)}
            onDemarrerPlan={() => depuis(() => declic.demarrerPlan(), ouvrirReglages)}
            onExporter={() => void partager(declic)}
            onSauvegarder={() => void sauvegarder(declic, clock.now())}
            onRestaurer={onRestaurer}
            onEffacer={onEffacer}
            extra={
              <ReglageCoach
                consenti={tdb?.coachIa ?? false}
                url={adresseCoach ?? ''}
                configure={adresseCoach !== null}
                onEnregistrer={enregistrerCoach}
                onConsentir={(accorde) => depuis(() => declic.consentirCoachIa(accorde), ouvrirReglages)}
                onTester={async () =>
                  (await declic.parlerAuCoach('soir', [{ role: 'user', texte: 'Test de connexion : dis bonjour en une phrase.' }])).texte
                }
              />
            }
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
            {...(coachDispo
              ? {
                  onCoach: () => {
                    setSos(false);
                    setCoachMode('sos');
                  },
                }
              : {})}
          />
        )}
        {progresVue && tdb && (
          <ProgresScreen
            tdb={tdb}
            progres={progresVue.progres}
            mot={progresVue.mot}
            coachIa={coachDispo}
            onFermer={() => setProgresVue(null)}
            onParlerCoach={() => {
              setProgresVue(null);
              setCoachMode((tdb.phase === 'arret' || tdb.phase === 'maintien') && tdb.fumees > 0 ? 'fauxpas' : 'soir');
            }}
            onAjouterObjectif={(l, c) => depuis(() => declic.definirObjectif(l, c), ouvrirProgres)}
            onRetirerObjectif={(l) => depuis(() => declic.retirerObjectif(l), ouvrirProgres)}
          />
        )}
        {coachMode && <CoachScreen mode={coachMode} onFermer={() => setCoachMode(null)} envoyer={(tours) => declic.parlerAuCoach(coachMode, tours)} />}
        <ContexteSheet visible={aPreciser !== null} contextesPerso={tdb?.contextesPerso ?? []} onChoisir={(p) => void onPreciser(p)} />
        <BandeauMiseAJour />
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  racine: { flex: 1, backgroundColor: couleurs.fond },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: couleurs.fond, padding: 24 },
  erreur: { color: couleurs.encre, fontSize: 16, textAlign: 'center' },
});

import { useState, type ComponentProps } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { NouveauProfil, Reglages, Sante } from './src/application/declic';
import { CoachHttp, normaliserUrlCoach } from './src/adapters/coachHttp';
import type { JourneeHistorique, MessageCoach, ModeCoach, Progres, Statistiques, AnalyseMontre, Axe, Destination } from './src/domain';
import { maSante } from './src/domain';
import type { Apercu, Choix, Simulation } from './src/application/migration';
import { effacer, partager, preparerImport, restaurer, sauvegarder } from './src/ui/app/donnees';
import { ImportScreen } from './src/ui/ImportScreen';
import { useApplication } from './src/ui/app/useApplication';
import { BandeauMiseAJour } from './src/ui/BandeauMiseAJour';
import { CoachScreen, ReglageCoach } from './src/ui/CoachScreen';
import { ContexteSheet, type Precision } from './src/ui/ContexteSheet';
import { DashboardScreen } from './src/ui/DashboardScreen';
import { HistoriqueScreen } from './src/ui/HistoriqueScreen';
import { OnboardingScreen } from './src/ui/OnboardingScreen';
import { ProgresScreen } from './src/ui/ProgresScreen';
import { ReglagesScreen } from './src/ui/ReglagesScreen';
import { SanteScreen } from './src/ui/SanteScreen';
import { StatsScreen } from './src/ui/StatsScreen';
import { MaSanteScreen } from './src/ui/MaSanteScreen';
import type { EtatMontre } from './src/ui/OngletMontre';
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
  const [resiste, setResiste] = useState(false);
  const [santeVue, setSanteVue] = useState<Sante | null>(null);
  const [statsVue, setStatsVue] = useState<Statistiques | null>(null);
  const [etatMontre, setEtatMontre] = useState<EtatMontre>('chargement');
  const [axesSante, setAxesSante] = useState<Axe[] | null>(null);
  const [ongletSante, setOngletSante] = useState<'bilans' | 'aliments' | 'cafeine' | 'montre' | 'sommeil'>('bilans');
  const [montre, setMontre] = useState<AnalyseMontre | null>(null);
  const [substituts, setSubstituts] = useState(false);
  const [progresVue, setProgresVue] = useState<{ progres: Progres; mot: MessageCoach | null } | null>(null);
  const [coachMode, setCoachMode] = useState<ModeCoach | null>(null);
  const [urlCoach, setUrlCoach] = useState<string | null | undefined>(undefined);
  const [historique, setHistorique] = useState<JourneeHistorique[] | null>(null);
  const [reglages, setReglages] = useState<Reglages | null>(null);
  const [importVue, setImportVue] = useState<{ apercu: Apercu; simulation: Simulation; choix: Choix; enCours: boolean } | null>(null);

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
  /** Toute action : en cas d'échec, on le dit (rien n'est enregistré), puis on rafraîchit. */
  const agir = (action: () => Promise<unknown>) => async () => {
    try {
      await action();
    } catch (e) {
      Alert.alert('Non enregistré', e instanceof Error ? e.message : String(e));
    }
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
  const ouvrirSante = async () => {
    setSanteVue(await declic.sante());
    if (etatMontre !== 'connecte') void lireMontre();
  };
  /** « Ma santé » : tous les axes d'un coup d'œil (RM-29). */
  const ouvrirMaSante = async (m: AnalyseMontre | null = montre) => {
    const [stats, sante, t] = await Promise.all([declic.statistiques(), declic.sante(), declic.tableauDeBord()]);
    if (!stats || !sante || !t) return;
    const anomalies = sante.suivi.filter((s) => s.derniere && s.derniere.statut !== 'normal').map((s) => s.parametre.nom.replace(/ \(.*\)$/, ''));
    setAxesSante(maSante({ aujourdhui: t.jour, tdb: t, stats, montre: m, anomalies }));
  };
  const ouvrirDetailSante = (d: Destination) => {
    if (d === 'stats') return void declic.statistiques().then(setStatsVue);
    setOngletSante(d === 'cafeine' ? 'cafeine' : d === 'montre' ? 'montre' : d === 'sommeil' ? 'sommeil' : 'bilans');
    void ouvrirSante();
  };
  /** Health Connect (RM-27) : lecture des 14 derniers jours, à la demande ; `demander` affiche l'autorisation. */
  const lireMontre = async (demander = false): Promise<AnalyseMontre | null> => {
    try {
      setEtatMontre('chargement');
      const r = await declic.lireMontre(demander);
      setEtatMontre(r.etat);
      if (r.analyse) setMontre(r.analyse);
      return r.analyse;
    } catch (e) {
      setEtatMontre('a-connecter');
      Alert.alert('Health Connect', e instanceof Error ? e.message : String(e));
      return null;
    }
  };
  const ouvrirHistorique = async () => setHistorique(await declic.historique(400));
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

  const onImporter = () =>
    void (async () => {
      const p = await preparerImport(declic);
      if (p) setImportVue({ ...p, choix: {}, enCours: false });
    })();
  const onChoixImport: ComponentProps<typeof ImportScreen>['onChoix'] = (appId, c) =>
    void (async () => {
      if (!importVue) return;
      const choix = { ...importVue.choix, [appId]: c };
      const simulation = await declic.simulerImport(importVue.apercu, choix);
      setImportVue({ ...importVue, choix, simulation });
    })();
  const onConfirmerImport = () =>
    void (async () => {
      if (!importVue) return;
      setImportVue({ ...importVue, enCours: true });
      try {
        const n = await declic.confirmerImport(importVue.apercu, importVue.choix);
        setImportVue(null);
        await rafraichir();
        if (reglages) await ouvrirReglages();
        Alert.alert('Historique importé', `${n} saisies ajoutées. Pense à faire une nouvelle sauvegarde.`);
      } catch (e) {
        setImportVue({ ...importVue, enCours: false });
        Alert.alert('Import impossible', `${e instanceof Error ? e.message : String(e)}. Rien n’a été modifié.`);
      }
    })();

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
            onResiste={() => setResiste(true)}
            onAnnuler={agir(() => declic.annulerDerniereSaisie())}
            onPalier={agir(() => declic.demanderPalier())}
            onDemarrerPlan={agir(() => declic.demarrerPlan())}
            onHistorique={() => void ouvrirHistorique()}
            onReglages={() => void ouvrirReglages()}
            onSubstituts={() => setSubstituts(true)}
            onSante={() =>
              void (async () => {
                await ouvrirMaSante();
                // La montre se lit en quelques secondes : la page se complète ensuite.
                if (etatMontre !== 'connecte') {
                  const m = await lireMontre();
                  if (m) await ouvrirMaSante(m);
                }
              })()
            }
            onCafe={agir(() => declic.boire('cafe'))}
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
            onCorrigerHeure={(id, hhmm) =>
              depuis(async () => {
                try {
                  await declic.corrigerHeure(id, hhmm);
                } catch (e) {
                  Alert.alert('Heure non modifiée', e instanceof Error ? e.message : String(e));
                }
              }, ouvrirHistorique)
            }
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
            onPoserPatch={(mg, h, hhmm) => void agir(() => declic.poserPatch(mg, h, hhmm))()}
            onRetirerPatch={(hhmm) => void agir(() => declic.retirerPatch(hhmm))()}
            onPrendre={(forme, mg) => void agir(() => declic.prendreSubstitutOral(forme, mg))()}
          />
        )}
        {reglages && (
          <ReglagesScreen
            reglages={reglages}
            onFermer={() => setReglages(null)}
            onPrix={(p, n) => depuis(() => declic.modifierPrix(p, n), ouvrirReglages)}
            onIntervalle={(m) => depuis(() => declic.modifierIntervalleRecommande(m), ouvrirReglages)}
            onObservation={(j) => depuis(() => declic.reglerObservation(j), ouvrirReglages)}
            onRythme={(st) => depuis(() => declic.modifierRythme(st), ouvrirReglages)}
            onPalier={(q) =>
              depuis(async () => {
                try {
                  await declic.fixerPalier(q);
                } catch (e) {
                  Alert.alert('Palier impossible', e instanceof Error ? e.message : String(e));
                }
              }, ouvrirReglages)
            }
            onRenommerContexte={(cle, l) => depuis(() => declic.renommerContexte(cle, l), ouvrirReglages)}
            onArchiverContexte={(cle) => depuis(() => declic.archiverContexte(cle), ouvrirReglages)}
            onMaximum={(q) => depuis(() => declic.imposerMaximum(q), ouvrirReglages)}
            onDemarrerPlan={() => depuis(() => declic.demarrerPlan(), ouvrirReglages)}
            onExporter={() => void partager(declic)}
            onSauvegarder={() => void sauvegarder(declic, clock.now())}
            onRestaurer={onRestaurer}
            onImporter={onImporter}
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
            techniques={tdb?.techniquesSos ?? []}
            onResiste={(technique) => {
              setSos(false);
              void agir(() => declic.enregistrerEnvieResistee(technique))();
            }}
            onFermer={(technique) => {
              setSos(false);
              void agir(() => declic.signalerEnvie(technique))();
            }}
            onAjouterRaison={(texte) => void agir(() => declic.ajouterRaison(texte))()}
            {...(coachDispo
              ? {
                  onCoach: (technique: string) => {
                    setSos(false);
                    void agir(() => declic.signalerEnvie(technique))();
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
            onParade={(c, p) => depuis(() => declic.definirParade(c, p), ouvrirProgres)}
            onStatistiques={() => void declic.statistiques().then(setStatsVue)}
          />
        )}
        {axesSante && (
          <MaSanteScreen axes={axesSante} montreConnectee={etatMontre === 'connecte'} onFermer={() => setAxesSante(null)} onOuvrir={ouvrirDetailSante} />
        )}
        {statsVue && tdb && <StatsScreen stats={statsVue} tdb={tdb} montre={montre} onFermer={() => setStatsVue(null)} />}
        {santeVue && tdb && (
          <SanteScreen
            key={ongletSante}
            ongletInitial={ongletSante}
            sante={santeVue}
            aujourdhui={tdb.jour}
            onFermer={() => setSanteVue(null)}
            onSaisirBilan={(d, v) => depuis(() => declic.saisirBilan(d, v), ouvrirSante)}
            onSupprimerBilan={(id) => depuis(() => declic.supprimerBilan(id), ouvrirSante)}
            onNorme={(p, min, max) => depuis(() => declic.definirNorme(p, min, max), ouvrirSante)}
            cafeine={tdb.cafeine}
            onBoire={(b) => depuis(() => declic.boire(b), ouvrirSante)}
            onAnnulerBoisson={(id) => depuis(() => declic.annulerBoisson(id), ouvrirSante)}
            onPalierCafeine={(q) => depuis(() => declic.fixerPalierCafeine(q), ouvrirSante)}
            montre={{ etat: etatMontre, analyse: montre, tz: app.clock.timeZone(), onConnecter: () => void lireMontre(true), onActualiser: () => void lireMontre() }}
          />
        )}
        {coachMode && <CoachScreen mode={coachMode} onFermer={() => setCoachMode(null)} envoyer={(tours) => declic.parlerAuCoach(coachMode, tours)} />}
        {importVue && (
          <ImportScreen
            apercu={importVue.apercu}
            simulation={importVue.simulation}
            choix={importVue.choix}
            tz={clock.timeZone()}
            enCours={importVue.enCours}
            onChoix={onChoixImport}
            onConfirmer={onConfirmerImport}
            onAnnuler={() => setImportVue(null)}
          />
        )}
        <ContexteSheet visible={aPreciser !== null} contextesPerso={tdb?.contextesPerso ?? []} onChoisir={(p) => void onPreciser(p)} />
        {/* « J'ai résisté » : dans quel contexte ? (pour suivre les parades) ; « Passer » enregistre sans contexte. */}
        <ContexteSheet
          visible={resiste}
          avecMoment={false}
          contextesPerso={tdb?.contextesPerso ?? []}
          onChoisir={({ contexte, nouveauContexte }) => {
            setResiste(false);
            void agir(async () => {
              const c = nouveauContexte ? await declic.ajouterContexte(nouveauContexte) : contexte;
              await declic.enregistrerEnvieResistee(undefined, 'phone', c);
            })();
          }}
        />
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

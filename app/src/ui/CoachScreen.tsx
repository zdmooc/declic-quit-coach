import { useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type ScrollViewInstance } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ModeCoach } from '../domain';
import type { TourCoach } from '../ports';
import { couleurs, espace } from './theme';

/**
 * Coach IA conversationnel (F7.2, F7.3, F7.4). Transparence (F7.6) : l'utilisateur sait qu'il
 * parle à une IA, et un recours humain est toujours visible. Les garde-fous (F7.5) sont
 * appliqués avant tout envoi par le cas d'usage `parlerAuCoach`.
 */
interface Props {
  mode: ModeCoach;
  onFermer: () => void;
  envoyer: (tours: TourCoach[]) => Promise<{ texte: string; garde: boolean }>;
}

const ACCUEIL: Record<ModeCoach, string> = {
  sos: 'Je suis là. Qu’est-ce qui se passe, là, maintenant ? Dis-moi où tu es et ce qui a déclenché l’envie.',
  soir: 'Raconte-moi ta journée : ce qui a bien marché, ce qui a été dur.',
  fauxpas: 'Tu as fumé, et ce n’est pas grave. On regarde ensemble ce qui s’est passé, sans jugement ?',
};

const SUGGESTIONS: Record<ModeCoach, string[]> = {
  sos: ['Je suis stressé', 'Je viens de boire un café', 'Je m’ennuie', 'Je suis avec des fumeurs'],
  soir: ['Plutôt bonne journée', 'Journée difficile', 'J’ai dépassé mon quota'],
  fauxpas: ['C’était en soirée', 'Le stress', 'Je ne sais pas trop'],
};

interface Bulle extends TourCoach {
  garde?: boolean;
}

export function CoachScreen({ mode, onFermer, envoyer }: Props) {
  const [bulles, setBulles] = useState<Bulle[]>([]);
  const [saisie, setSaisie] = useState('');
  const [attente, setAttente] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const defilement = useRef<ScrollViewInstance>(null);

  const parler = async (texte: string) => {
    const propre = texte.trim();
    if (!propre || attente) return;
    const tours: Bulle[] = [...bulles, { role: 'user', texte: propre }];
    setBulles(tours);
    setSaisie('');
    setErreur(null);
    setAttente(true);
    try {
      const r = await envoyer(tours.map(({ role, texte: t }) => ({ role, texte: t })));
      setBulles([...tours, { role: 'assistant', texte: r.texte, garde: r.garde }]);
    } catch (e) {
      setErreur(`${e instanceof Error ? e.message : 'Le coach ne répond pas'}. Le SOS respiration fonctionne toujours, même hors ligne.`);
    } finally {
      setAttente(false);
    }
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onFermer}>
      <SafeAreaView style={styles.page} edges={['top', 'bottom']}>
        <View style={styles.entete}>
          <View style={styles.flex}>
            <Text style={styles.titre}>Coach Déclic</Text>
            <Text style={styles.ia}>Tu parles à une IA · elle ne remplace pas un professionnel</Text>
          </View>
          <Pressable onPress={onFermer} accessibilityRole="button" hitSlop={8}>
            <Text style={styles.fermer}>Fermer</Text>
          </Pressable>
        </View>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            ref={defilement}
            contentContainerStyle={styles.fil}
            onContentSizeChange={() => defilement.current?.scrollToEnd({ animated: true })}
            keyboardShouldPersistTaps="handled"
          >
            <View style={[styles.bulle, styles.bulleCoach]}>
              <Text style={styles.texteCoach}>{ACCUEIL[mode]}</Text>
            </View>
            {bulles.length === 0 && (
              <View style={styles.suggestions}>
                {SUGGESTIONS[mode].map((s) => (
                  <Pressable key={s} style={styles.suggestion} onPress={() => void parler(s)} accessibilityRole="button">
                    <Text style={styles.suggestionTexte}>{s}</Text>
                  </Pressable>
                ))}
              </View>
            )}
            {bulles.map((b, i) => (
              <View key={i} style={[styles.bulle, b.role === 'user' ? styles.bulleMoi : styles.bulleCoach, b.garde && styles.bulleGarde]}>
                <Text style={b.role === 'user' ? styles.texteMoi : styles.texteCoach}>{b.texte}</Text>
              </View>
            ))}
            {attente && <ActivityIndicator color={couleurs.vert} style={styles.attente} />}
            {erreur && <Text style={styles.erreur}>{erreur}</Text>}
          </ScrollView>
          <View style={styles.saisie}>
            <TextInput
              style={styles.champ}
              value={saisie}
              onChangeText={setSaisie}
              placeholder="Écris au coach…"
              multiline
              maxLength={500}
              accessibilityLabel="Message au coach"
            />
            <Pressable
              style={[styles.envoyer, (!saisie.trim() || attente) && styles.inactif]}
              disabled={!saisie.trim() || attente}
              onPress={() => void parler(saisie)}
              accessibilityRole="button"
            >
              <Text style={styles.envoyerTexte}>Envoyer</Text>
            </Pressable>
          </View>
          <Text style={styles.mention}>Urgence : 15 ou 112 · Tabac Info Service : 39 89 · Prévention du suicide : 3114</Text>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Réglage du coach IA (carte de l'écran Réglages)                      */
/* ------------------------------------------------------------------ */

interface PropsReglage {
  consenti: boolean;
  url: string;
  configure: boolean;
  onEnregistrer: (url: string, jeton: string) => void;
  onConsentir: (accorde: boolean) => void;
  onTester: () => Promise<string>;
}

export function ReglageCoach({ consenti, url, configure, onEnregistrer, onConsentir, onTester }: PropsReglage) {
  const [adresse, setAdresse] = useState(url);
  const [jeton, setJeton] = useState('');
  const [test, setTest] = useState<string | null>(null);
  const valide = /^https:\/\/\S+$/.test(adresse.trim()) && jeton.trim().length >= 8;

  return (
    <View style={styles.carte}>
      <Text style={styles.petit}>Coach IA</Text>
      <Text style={styles.aide}>
        Le coach IA reçoit seulement un résumé chiffré de ta journée (quota, cigarettes, déclencheur principal, économies arrondies) et
        tes messages. Jamais ton historique détaillé ni tes raisons. Il ne donne aucun conseil de dosage.
      </Text>
      <Pressable
        style={[styles.boutonReglage, consenti && styles.boutonReglageActif]}
        onPress={() => onConsentir(!consenti)}
        accessibilityRole="switch"
        accessibilityState={{ checked: consenti }}
      >
        <Text style={[styles.boutonReglageTexte, consenti && styles.boutonReglageTexteActif]}>
          {consenti ? '✓ J’accepte l’envoi de ce résumé' : 'J’accepte l’envoi de ce résumé'}
        </Text>
      </Pressable>
      <Text style={styles.libelle}>Adresse du relais</Text>
      <TextInput
        style={styles.champReglage}
        value={adresse}
        onChangeText={setAdresse}
        placeholder="https://declic-coach.xxx.workers.dev"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        accessibilityLabel="Adresse du relais du coach"
      />
      <Text style={styles.libelle}>Code d’accès</Text>
      <TextInput
        style={styles.champReglage}
        value={jeton}
        onChangeText={setJeton}
        placeholder={configure ? '•••••••• (enregistré)' : 'code choisi lors de l’installation du relais'}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
        accessibilityLabel="Code d’accès du relais"
      />
      <Pressable
        style={[styles.boutonPlein, !valide && styles.inactif]}
        disabled={!valide}
        onPress={() => {
          onEnregistrer(adresse.trim(), jeton.trim());
          setJeton('');
          setTest(null);
        }}
        accessibilityRole="button"
      >
        <Text style={styles.boutonPleinTexte}>Enregistrer</Text>
      </Pressable>
      {configure && consenti && (
        <Pressable
          onPress={() => {
            setTest('Test en cours…');
            onTester().then(
              (r) => setTest(`✓ Le coach répond : « ${r.slice(0, 80)}${r.length > 80 ? '…' : ''} »`),
              (e: unknown) => setTest(`✗ ${e instanceof Error ? e.message : 'Échec du test'}`),
            );
          }}
          accessibilityRole="button"
          hitSlop={8}
        >
          <Text style={styles.lien}>Tester le coach</Text>
        </Pressable>
      )}
      {test && <Text style={styles.aide}>{test}</Text>}
      <Text style={styles.aide}>{configure ? 'Relais configuré.' : 'Pas encore configuré : le coach écrit (bilan du soir, faux pas) fonctionne déjà sans IA.'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: couleurs.fond },
  flex: { flex: 1 },
  entete: { flexDirection: 'row', alignItems: 'center', gap: espace(3), paddingHorizontal: espace(4), paddingVertical: espace(3) },
  titre: { color: couleurs.encre, fontSize: 24, fontWeight: '800' },
  ia: { color: couleurs.doux, fontSize: 12 },
  fermer: { color: couleurs.vert, fontSize: 16, fontWeight: '700' },
  fil: { paddingHorizontal: espace(4), paddingBottom: espace(4), gap: espace(2) },
  bulle: { maxWidth: '85%', borderRadius: 18, paddingHorizontal: espace(4), paddingVertical: espace(3) },
  bulleCoach: { alignSelf: 'flex-start', backgroundColor: couleurs.carte, borderWidth: 1, borderColor: couleurs.ligne },
  bulleMoi: { alignSelf: 'flex-end', backgroundColor: couleurs.vert },
  bulleGarde: { borderColor: couleurs.ambre, backgroundColor: couleurs.ambreClair },
  texteCoach: { color: couleurs.encre, fontSize: 15, lineHeight: 22 },
  texteMoi: { color: '#FFFFFF', fontSize: 15, lineHeight: 22 },
  suggestions: { flexDirection: 'row', flexWrap: 'wrap', gap: espace(2) },
  suggestion: { borderRadius: 999, borderWidth: 1.5, borderColor: couleurs.vert, paddingHorizontal: espace(3), paddingVertical: espace(2) },
  suggestionTexte: { color: couleurs.vert, fontSize: 14, fontWeight: '600' },
  attente: { alignSelf: 'flex-start', marginLeft: espace(4) },
  erreur: { color: couleurs.rouge, fontSize: 13 },
  saisie: { flexDirection: 'row', alignItems: 'flex-end', gap: espace(2), paddingHorizontal: espace(4), paddingTop: espace(2) },
  champ: { flex: 1, maxHeight: 120, borderWidth: 1, borderColor: couleurs.ligne, borderRadius: 16, paddingHorizontal: espace(3), paddingVertical: espace(2), fontSize: 15, color: couleurs.encre, backgroundColor: couleurs.carte },
  envoyer: { backgroundColor: couleurs.vert, borderRadius: 16, paddingHorizontal: espace(4), paddingVertical: espace(3) },
  envoyerTexte: { color: '#FFFFFF', fontWeight: '700' },
  inactif: { opacity: 0.4 },
  mention: { color: couleurs.doux, fontSize: 11, textAlign: 'center', paddingVertical: espace(2), paddingHorizontal: espace(4) },
  carte: { backgroundColor: couleurs.carte, borderRadius: 18, borderWidth: 1, borderColor: couleurs.ligne, padding: espace(4), gap: espace(2) },
  petit: { color: couleurs.doux, fontSize: 13, fontWeight: '700', textTransform: 'uppercase' },
  aide: { color: couleurs.doux, fontSize: 13, lineHeight: 18 },
  libelle: { color: couleurs.encre, fontSize: 14, fontWeight: '600', marginTop: espace(1) },
  champReglage: { borderWidth: 1, borderColor: couleurs.ligne, borderRadius: 12, paddingHorizontal: espace(3), paddingVertical: espace(2), fontSize: 15, color: couleurs.encre, backgroundColor: couleurs.fond },
  boutonReglage: { borderRadius: 14, borderWidth: 1.5, borderColor: couleurs.vert, paddingVertical: espace(3), alignItems: 'center' },
  boutonReglageActif: { backgroundColor: couleurs.vert },
  boutonReglageTexte: { color: couleurs.vert, fontSize: 15, fontWeight: '700' },
  boutonReglageTexteActif: { color: '#FFFFFF' },
  boutonPlein: { backgroundColor: couleurs.vert, borderRadius: 14, paddingVertical: espace(3), alignItems: 'center', marginTop: espace(1) },
  boutonPleinTexte: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  lien: { color: couleurs.vert, fontSize: 14, fontWeight: '600', textDecorationLine: 'underline' },
});

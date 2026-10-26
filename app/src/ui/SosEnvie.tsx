import { useEffect, useState } from 'react';
import { Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatEuros } from '../domain';
import { couleurs, espace } from './theme';

interface Props {
  raisons: readonly string[];
  /** Économies projetées sur un an après l'arrêt, pour la motivation. */
  economieAnCents: number;
  onResiste: () => void;
  onFermer: () => void;
  onAjouterRaison: (texte: string) => void;
  /** Ouvre le coach IA (si activé). */
  onCoach?: () => void;
}

/** Cohérence cardiaque : 5 s d'inspiration, 5 s d'expiration, pendant 3 minutes. */
const DEMI_CYCLE_MS = 5_000;
const DUREE_S = 180;

/**
 * SOS envie (F7.1) : respiration guidée hors ligne, rappel des raisons d'arrêter,
 * puis « L'envie est passée » (envie résistée) ou fermeture sans jugement.
 * Monté à l'ouverture et démonté à la fermeture : chaque SOS repart de zéro.
 */
export function SosEnvie({ raisons, economieAnCents, onResiste, onFermer, onAjouterRaison, onCoach }: Props) {
  const [ecoule, setEcoule] = useState(0);
  const [saisie, setSaisie] = useState<string | null>(null);
  const [echelle] = useState(() => new Animated.Value(0.6));

  useEffect(() => {
    const boucle = Animated.loop(
      Animated.sequence([
        Animated.timing(echelle, { toValue: 1, duration: DEMI_CYCLE_MS, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(echelle, { toValue: 0.6, duration: DEMI_CYCLE_MS, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    boucle.start();
    const timer = setInterval(() => setEcoule((s) => Math.min(DUREE_S, s + 1)), 1000);
    return () => {
      boucle.stop();
      clearInterval(timer);
    };
  }, [echelle]);

  const termine = ecoule >= DUREE_S;
  const inspire = Math.floor((ecoule * 1000) / DEMI_CYCLE_MS) % 2 === 0;
  const reste = DUREE_S - ecoule;
  const texte = saisie?.trim() ?? '';

  return (
    <Modal visible animationType="fade" onRequestClose={onFermer}>
      <SafeAreaView style={styles.page} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.contenu} keyboardShouldPersistTaps="handled">
          <Text style={styles.titre}>Une envie, c’est une vague : elle passe.</Text>
          <Text style={styles.sous}>Respire avec le cercle pendant 3 minutes.</Text>

          <View style={styles.zoneCercle}>
            <Animated.View style={[styles.cercle, { transform: [{ scale: echelle }] }]} />
            <View style={styles.centreCercle}>
              <Text style={styles.consigne}>{termine ? 'Bravo' : inspire ? 'Inspire…' : 'Expire…'}</Text>
              <Text style={styles.temps}>
                {termine ? '3 min tenues' : `${Math.floor(reste / 60)}:${String(reste % 60).padStart(2, '0')}`}
              </Text>
            </View>
          </View>

          <View style={styles.carte}>
            <Text style={styles.petit}>Tes raisons</Text>
            {raisons.length === 0 && <Text style={styles.raison}>Ajoute une raison qui compte pour toi.</Text>}
            {raisons.map((r, i) => (
              <Text key={`${i}-${r}`} style={styles.raison}>
                • {r}
              </Text>
            ))}
            {economieAnCents > 0 && <Text style={styles.raison}>• {formatEuros(economieAnCents)} par an dans ta poche</Text>}
            {saisie === null ? (
              <Pressable onPress={() => setSaisie('')} accessibilityRole="button">
                <Text style={styles.lien}>+ Ajouter une raison</Text>
              </Pressable>
            ) : (
              <View style={styles.ajout}>
                <TextInput
                  style={styles.champ}
                  value={saisie}
                  onChangeText={setSaisie}
                  placeholder="Ex. : retrouver mon souffle"
                  placeholderTextColor={couleurs.doux}
                  maxLength={120}
                  autoFocus
                  accessibilityLabel="Nouvelle raison"
                />
                <Pressable
                  style={[styles.boutonAjout, texte.length === 0 && styles.inactif]}
                  disabled={texte.length === 0}
                  onPress={() => {
                    onAjouterRaison(texte);
                    setSaisie(null);
                  }}
                  accessibilityRole="button"
                >
                  <Text style={styles.boutonAjoutTexte}>Ajouter</Text>
                </Pressable>
              </View>
            )}
          </View>
        </ScrollView>

        <View style={styles.actions}>
          <Pressable style={styles.bouton} onPress={onResiste} accessibilityRole="button">
            <Text style={styles.boutonTexte}>L’envie est passée</Text>
          </Pressable>
          {onCoach && (
            <Pressable style={[styles.bouton, styles.boutonCoach]} onPress={onCoach} accessibilityRole="button">
              <Text style={[styles.boutonTexte, styles.boutonCoachTexte]}>Parler au coach</Text>
            </Pressable>
          )}
          <Pressable style={styles.fermer} onPress={onFermer} accessibilityRole="button">
            <Text style={styles.fermerTexte}>Fermer</Text>
          </Pressable>
          <Text style={styles.mention}>Envie trop forte ou détresse ? Tabac Info Service : 39 89</Text>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const TAILLE = 220;

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: couleurs.fond },
  contenu: { padding: espace(5), alignItems: 'stretch' },
  titre: { color: couleurs.encre, fontSize: 24, fontWeight: '800', textAlign: 'center', marginTop: espace(2) },
  sous: { color: couleurs.doux, fontSize: 15, textAlign: 'center', marginTop: espace(1) },
  zoneCercle: { height: TAILLE + espace(8), alignItems: 'center', justifyContent: 'center' },
  cercle: { position: 'absolute', width: TAILLE, height: TAILLE, borderRadius: TAILLE / 2, backgroundColor: couleurs.vertClair, borderWidth: 3, borderColor: couleurs.vert },
  centreCercle: { alignItems: 'center' },
  consigne: { color: couleurs.vert, fontSize: 26, fontWeight: '800' },
  temps: { color: couleurs.doux, fontSize: 16, marginTop: espace(1), fontVariant: ['tabular-nums'] },
  carte: { backgroundColor: couleurs.carte, borderRadius: 18, borderWidth: 1, borderColor: couleurs.ligne, padding: espace(4) },
  petit: { color: couleurs.doux, fontSize: 15, fontWeight: '700', textTransform: 'uppercase', marginBottom: espace(2) },
  raison: { color: couleurs.encre, fontSize: 16, lineHeight: 24 },
  lien: { color: couleurs.vert, fontSize: 15, fontWeight: '600', marginTop: espace(2) },
  ajout: { flexDirection: 'row', gap: espace(2), marginTop: espace(2) },
  champ: { flex: 1, borderWidth: 1, borderColor: couleurs.ligne, borderRadius: 12, paddingHorizontal: espace(3), paddingVertical: espace(2), fontSize: 15, color: couleurs.encre },
  boutonAjout: { backgroundColor: couleurs.vert, borderRadius: 12, paddingHorizontal: espace(4), justifyContent: 'center' },
  boutonAjoutTexte: { color: '#FFFFFF', fontWeight: '700' },
  inactif: { opacity: 0.4 },
  actions: { paddingHorizontal: espace(5), paddingBottom: espace(2) },
  bouton: { backgroundColor: couleurs.vert, borderRadius: 16, paddingVertical: espace(4), alignItems: 'center' },
  boutonTexte: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  boutonCoach: { backgroundColor: couleurs.carte, borderWidth: 2, borderColor: couleurs.vert, marginTop: espace(2) },
  boutonCoachTexte: { color: couleurs.vert },
  fermer: { alignItems: 'center', paddingVertical: espace(3) },
  fermerTexte: { color: couleurs.doux, fontSize: 15, textDecorationLine: 'underline' },
  mention: { color: couleurs.doux, fontSize: 14, textAlign: 'center' },
});

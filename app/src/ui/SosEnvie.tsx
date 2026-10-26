import { useEffect, useState } from 'react';
import { Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatEuros, phaseA, TECHNIQUES, type BilanTechnique, type CleTechnique } from '../domain';
import { couleurs, espace } from './theme';

interface Props {
  raisons: readonly string[];
  /** Économies projetées sur un an après l'arrêt, pour la motivation. */
  economieAnCents: number;
  /** Bilan des SOS précédents par technique (la plus efficace d'abord). */
  techniques: readonly BilanTechnique[];
  onResiste: (technique: CleTechnique) => void;
  onFermer: (technique: CleTechnique) => void;
  onAjouterRaison: (texte: string) => void;
  /** Ouvre le coach IA (si activé). */
  onCoach?: (technique: CleTechnique) => void;
}

const DUREE_S = 180;

/**
 * SOS envie (F7.1) : respiration guidée hors ligne, rappel des raisons d'arrêter,
 * puis « L'envie est passée » (envie résistée) ou fermeture sans jugement.
 * Monté à l'ouverture et démonté à la fermeture : chaque SOS repart de zéro.
 */
export function SosEnvie({ raisons, economieAnCents, techniques, onResiste, onFermer, onAjouterRaison, onCoach }: Props) {
  // Par défaut, la technique qui a le mieux marché jusqu'ici.
  const [cle, setCle] = useState<CleTechnique>(techniques.find((b) => b.resistees > 0)?.cle ?? 'coherence');
  const tech = TECHNIQUES.find((t) => t.cle === cle)!;
  const [ms, setMs] = useState(0);
  const [saisie, setSaisie] = useState<string | null>(null);
  const [echelle] = useState(() => new Animated.Value(0.6));

  // Changer de technique relance le cercle et les 3 minutes.
  useEffect(() => {
    echelle.setValue(0.6);
    const boucle = Animated.loop(
      Animated.sequence(
        tech.phases.map((p) =>
          p.vers === null
            ? Animated.delay(p.secondes * 1000)
            : Animated.timing(echelle, { toValue: p.vers, duration: p.secondes * 1000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ),
      ),
    );
    boucle.start();
    const debut = Date.now();
    const timer = setInterval(() => setMs(Math.min(DUREE_S * 1000, Date.now() - debut)), 250);
    return () => {
      boucle.stop();
      clearInterval(timer);
    };
  }, [echelle, tech]);

  const ecoule = Math.floor(ms / 1000);
  const termine = ecoule >= DUREE_S;
  const consigne = phaseA(tech, ms).consigne;
  const reste = DUREE_S - ecoule;
  const bilan = techniques.filter((b) => b.resistees + b.sansIssue > 0);
  const texte = saisie?.trim() ?? '';

  return (
    <Modal visible animationType="fade" onRequestClose={() => onFermer(cle)}>
      <SafeAreaView style={styles.page} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.contenu} keyboardShouldPersistTaps="handled">
          <Text style={styles.titre}>Une envie, c’est une vague : elle passe.</Text>
          <View style={styles.choixTech}>
            {TECHNIQUES.map((t) => (
              <Pressable
                key={t.cle}
                style={[styles.puce, t.cle === cle && styles.puceActive]}
                onPress={() => {
                  setCle(t.cle);
                  setMs(0);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: t.cle === cle }}
              >
                <Text style={[styles.puceTexte, t.cle === cle && styles.puceTexteActive]}>{t.nom}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.sous}>{tech.description} Suis le cercle pendant 3 minutes.</Text>

          <View style={styles.zoneCercle}>
            <Animated.View style={[styles.cercle, { transform: [{ scale: echelle }] }]} />
            <View style={styles.centreCercle}>
              <Text style={styles.consigne}>{termine ? 'Bravo' : consigne}</Text>
              <Text style={styles.temps}>
                {termine ? '3 min tenues' : `${Math.floor(reste / 60)}:${String(reste % 60).padStart(2, '0')}`}
              </Text>
            </View>
          </View>

          {bilan.length > 0 && (
            <View style={[styles.carte, styles.espaceBas]}>
              <Text style={styles.petit}>Ce qui marche pour toi</Text>
              {bilan.map((b) => (
                <Text key={b.cle} style={styles.raison}>
                  • {b.nom} : {b.resistees} envie{b.resistees > 1 ? 's' : ''} passée{b.resistees > 1 ? 's' : ''} sur {b.resistees + b.sansIssue}
                </Text>
              ))}
            </View>
          )}

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
          <Pressable style={styles.bouton} onPress={() => onResiste(cle)} accessibilityRole="button">
            <Text style={styles.boutonTexte}>L’envie est passée</Text>
          </Pressable>
          {onCoach && (
            <Pressable style={[styles.bouton, styles.boutonCoach]} onPress={() => onCoach(cle)} accessibilityRole="button">
              <Text style={[styles.boutonTexte, styles.boutonCoachTexte]}>Parler au coach</Text>
            </Pressable>
          )}
          <Pressable style={styles.fermer} onPress={() => onFermer(cle)} accessibilityRole="button">
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
  choixTech: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: espace(2), marginTop: espace(3) },
  puce: { borderWidth: 1.5, borderColor: couleurs.vert, borderRadius: 999, paddingHorizontal: espace(3), paddingVertical: espace(1) + 2 },
  puceActive: { backgroundColor: couleurs.vert },
  puceTexte: { color: couleurs.vert, fontSize: 14, fontWeight: '700' },
  puceTexteActive: { color: '#FFFFFF' },
  espaceBas: { marginBottom: espace(3) },
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

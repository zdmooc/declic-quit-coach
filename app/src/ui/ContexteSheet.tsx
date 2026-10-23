import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { CONTEXTES, LIBELLES_CONTEXTE, type ContexteCigarette } from '../domain';
import { couleurs, espace } from './theme';

interface Props {
  visible: boolean;
  onChoisir: (precision: { contexte?: ContexteCigarette; ilYaMinutes?: number }) => void;
}

const MOMENTS: { libelle: string; minutes: number }[] = [
  { libelle: 'À l’instant', minutes: 0 },
  { libelle: 'Il y a 10 min', minutes: 10 },
  { libelle: 'Il y a 30 min', minutes: 30 },
  { libelle: 'Il y a 1 h', minutes: 60 },
];

/**
 * Feuille affichée juste après « J'ai fumé » (RM-16) : un tap sur un contexte enregistre
 * le contexte (et l'heure si elle a été corrigée). « Passer » ferme sans contexte.
 */
export function ContexteSheet({ visible, onChoisir }: Props) {
  const [ilYa, setIlYa] = useState(0);

  const fermer = (contexte?: ContexteCigarette) => {
    onChoisir({ ...(contexte ? { contexte } : {}), ...(ilYa > 0 ? { ilYaMinutes: ilYa } : {}) });
    setIlYa(0);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => fermer()}>
      <Pressable style={styles.voile} onPress={() => fermer()} accessibilityLabel="Fermer" />
      <View style={styles.feuille}>
        <Text style={styles.titre}>Qu’est-ce qui t’a donné envie ?</Text>
        <Text style={styles.sous}>Un tap suffit. Ça m’aide à repérer tes moments à risque.</Text>
        <View style={styles.grille}>
          {CONTEXTES.map((c) => (
            <Pressable key={c} style={styles.puce} onPress={() => fermer(c)} accessibilityRole="button">
              <Text style={styles.puceTexte}>{LIBELLES_CONTEXTE[c]}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.section}>C’était</Text>
        <View style={styles.grille}>
          {MOMENTS.map((m) => (
            <Pressable
              key={m.minutes}
              style={[styles.moment, ilYa === m.minutes && styles.momentActif]}
              onPress={() => setIlYa(m.minutes)}
              accessibilityRole="button"
              accessibilityState={{ selected: ilYa === m.minutes }}
            >
              <Text style={[styles.momentTexte, ilYa === m.minutes && styles.momentTexteActif]}>{m.libelle}</Text>
            </Pressable>
          ))}
        </View>
        <Pressable style={styles.passer} onPress={() => fermer()} accessibilityRole="button">
          <Text style={styles.passerTexte}>Passer</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  voile: { flex: 1, backgroundColor: 'rgba(30, 42, 37, 0.35)' },
  feuille: {
    backgroundColor: couleurs.fond,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: espace(6),
    paddingBottom: espace(10),
  },
  titre: { color: couleurs.encre, fontSize: 22, fontWeight: '700' },
  sous: { color: couleurs.doux, fontSize: 14, marginTop: espace(1), marginBottom: espace(4) },
  grille: { flexDirection: 'row', flexWrap: 'wrap', gap: espace(2) },
  puce: {
    backgroundColor: couleurs.carte,
    borderColor: couleurs.vert,
    borderWidth: 1.5,
    borderRadius: 999,
    paddingHorizontal: espace(4),
    paddingVertical: espace(3),
  },
  puceTexte: { color: couleurs.vert, fontSize: 16, fontWeight: '600' },
  section: { color: couleurs.doux, fontSize: 13, fontWeight: '600', textTransform: 'uppercase', marginTop: espace(5), marginBottom: espace(2) },
  moment: { borderRadius: 999, paddingHorizontal: espace(3), paddingVertical: espace(2), backgroundColor: couleurs.ligne },
  momentActif: { backgroundColor: couleurs.encre },
  momentTexte: { color: couleurs.encre, fontSize: 14 },
  momentTexteActif: { color: '#FFFFFF', fontWeight: '600' },
  passer: { alignItems: 'center', paddingTop: espace(5) },
  passerTexte: { color: couleurs.doux, fontSize: 15, textDecorationLine: 'underline' },
});

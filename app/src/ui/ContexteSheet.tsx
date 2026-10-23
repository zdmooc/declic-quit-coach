import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { CONTEXTES, LIBELLES_CONTEXTE, type ContexteCigarette, type ContextePerso } from '../domain';
import { couleurs, espace } from './theme';

export interface Precision {
  contexte?: ContexteCigarette;
  /** Nouveau contexte saisi par l'utilisateur (sera ajouté à sa liste). */
  nouveauContexte?: string;
  ilYaMinutes?: number;
}

interface Props {
  visible: boolean;
  contextesPerso: readonly ContextePerso[];
  onChoisir: (precision: Precision) => void;
}

const MOMENTS: { libelle: string; minutes: number }[] = [
  { libelle: 'À l’instant', minutes: 0 },
  { libelle: 'Il y a 10 min', minutes: 10 },
  { libelle: 'Il y a 30 min', minutes: 30 },
  { libelle: 'Il y a 1 h', minutes: 60 },
];

const LONGUEUR_MAX = 30;

/**
 * Feuille affichée juste après « J'ai fumé » (RM-16) : un tap sur un contexte l'enregistre.
 * « + Ajouter un contexte » ouvre un champ de saisie ; le contexte saisi est ensuite proposé
 * comme les autres. « Passer » ferme sans contexte.
 */
export function ContexteSheet({ visible, contextesPerso, onChoisir }: Props) {
  const [ilYa, setIlYa] = useState(0);
  const [saisie, setSaisie] = useState<string | null>(null);

  const fermer = (choix: Omit<Precision, 'ilYaMinutes'> = {}) => {
    onChoisir({ ...choix, ...(ilYa > 0 ? { ilYaMinutes: ilYa } : {}) });
    setIlYa(0);
    setSaisie(null);
  };

  const valeur = saisie?.trim() ?? '';
  const valide = valeur.length >= 1 && valeur.length <= LONGUEUR_MAX;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => fermer()}>
      <KeyboardAvoidingView style={styles.conteneur} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.voile} onPress={() => fermer()} accessibilityLabel="Fermer" />
        <View style={styles.feuille}>
          <Text style={styles.titre}>Qu’est-ce qui t’a donné envie ?</Text>
          <Text style={styles.sous}>Un tap suffit. Ça m’aide à repérer tes moments à risque.</Text>

          <View style={styles.grille}>
            {CONTEXTES.map((c) => (
              <Pressable key={c} style={styles.puce} onPress={() => fermer({ contexte: c })} accessibilityRole="button">
                <Text style={styles.puceTexte}>{LIBELLES_CONTEXTE[c]}</Text>
              </Pressable>
            ))}
            {contextesPerso.map((c) => (
              <Pressable key={c.cle} style={styles.puce} onPress={() => fermer({ contexte: c.cle })} accessibilityRole="button">
                <Text style={styles.puceTexte}>{c.libelle}</Text>
              </Pressable>
            ))}
            {saisie === null && (
              <Pressable style={[styles.puce, styles.puceAjout]} onPress={() => setSaisie('')} accessibilityRole="button">
                <Text style={[styles.puceTexte, styles.puceAjoutTexte]}>+ Ajouter un contexte</Text>
              </Pressable>
            )}
          </View>

          {saisie !== null && (
            <View style={styles.ajout}>
              <TextInput
                style={styles.champ}
                value={saisie}
                onChangeText={setSaisie}
                placeholder="Ex. : au volant, au téléphone…"
                placeholderTextColor={couleurs.doux}
                maxLength={LONGUEUR_MAX}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={() => valide && fermer({ nouveauContexte: valeur })}
                accessibilityLabel="Nouveau contexte"
              />
              <Pressable
                style={[styles.boutonAjout, !valide && styles.boutonInactif]}
                disabled={!valide}
                onPress={() => fermer({ nouveauContexte: valeur })}
                accessibilityRole="button"
              >
                <Text style={styles.boutonAjoutTexte}>Ajouter</Text>
              </Pressable>
            </View>
          )}

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
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  conteneur: { flex: 1 },
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
  puceAjout: { borderStyle: 'dashed', backgroundColor: 'transparent' },
  puceAjoutTexte: { color: couleurs.encre },
  ajout: { flexDirection: 'row', gap: espace(2), marginTop: espace(3) },
  champ: {
    flex: 1,
    backgroundColor: couleurs.carte,
    borderColor: couleurs.ligne,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: espace(4),
    paddingVertical: espace(3),
    fontSize: 16,
    color: couleurs.encre,
  },
  boutonAjout: { backgroundColor: couleurs.vert, borderRadius: 12, paddingHorizontal: espace(4), justifyContent: 'center' },
  boutonInactif: { opacity: 0.4 },
  boutonAjoutTexte: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  section: { color: couleurs.doux, fontSize: 13, fontWeight: '600', textTransform: 'uppercase', marginTop: espace(5), marginBottom: espace(2) },
  moment: { borderRadius: 999, paddingHorizontal: espace(3), paddingVertical: espace(2), backgroundColor: couleurs.ligne },
  momentActif: { backgroundColor: couleurs.encre },
  momentTexte: { color: couleurs.encre, fontSize: 14 },
  momentTexteActif: { color: '#FFFFFF', fontWeight: '600' },
  passer: { alignItems: 'center', paddingTop: espace(5) },
  passerTexte: { color: couleurs.doux, fontSize: 15, textDecorationLine: 'underline' },
});

import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Axe, Couleur, Destination } from '../domain';
import { couleurs, espace } from './theme';

/** « Ma santé » (RM-29) : tous les axes d'un coup d'œil ; un tap ouvre le détail. */
interface Props {
  axes: Axe[];
  montreConnectee: boolean;
  onFermer: () => void;
  onOuvrir: (d: Destination) => void;
}

const TEINTES: Record<Couleur, { texte: string; fond: string; bord: string }> = {
  vert: { texte: couleurs.vert, fond: couleurs.vertClair, bord: couleurs.vert },
  ambre: { texte: couleurs.ambre, fond: couleurs.ambreClair, bord: couleurs.ambre },
  rouge: { texte: couleurs.rouge, fond: couleurs.rougeClair, bord: couleurs.rouge },
  neutre: { texte: couleurs.encre, fond: couleurs.carte, bord: couleurs.ligne },
};

export function MaSanteScreen({ axes, montreConnectee, onFermer, onOuvrir }: Props) {
  const rouges = axes.filter((a) => a.couleur === 'rouge').length;
  return (
    <Modal visible animationType="slide" onRequestClose={onFermer}>
      <SafeAreaView style={styles.page} edges={['top', 'bottom']}>
        <View style={styles.entete}>
          <Text style={styles.titre}>Ma santé</Text>
          <Pressable onPress={onFermer} accessibilityRole="button" hitSlop={10}>
            <Text style={styles.fermer}>Fermer</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.contenu}>
          <Text style={styles.resume}>
            {rouges === 0 ? 'Tout est vert ou orange cette semaine.' : `${rouges} point${rouges > 1 ? 's' : ''} à travailler cette semaine.`}
          </Text>
          <View style={styles.grille}>
            {axes.map((a) => {
              const t = TEINTES[a.couleur];
              return (
                <Pressable
                  key={a.cle}
                  style={[styles.tuile, { backgroundColor: t.fond, borderColor: t.bord }]}
                  onPress={() => onOuvrir(a.aller)}
                  accessibilityRole="button"
                  accessibilityLabel={`${a.titre} : ${a.valeur}`}
                >
                  <Text style={styles.nom} numberOfLines={2}>
                    {a.titre}
                  </Text>
                  <Text style={[styles.valeur, { color: t.texte }]} numberOfLines={1} adjustsFontSizeToFit>
                    {a.valeur}
                  </Text>
                  {a.evolution && (
                    <Text style={[styles.evolution, a.progres === true && styles.mieux, a.progres === false && styles.moins]} numberOfLines={1}>
                      {a.evolution}
                    </Text>
                  )}
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.aide}>Semaine (7 derniers jours) comparée à la précédente. Touche une case pour le détail.</Text>
          {!montreConnectee && <Text style={styles.aide}>Connecte ta montre (Santé → Montre) pour le sommeil, le cœur, l’HRV et les pas.</Text>}
          <Pressable style={styles.bouton} onPress={() => onOuvrir('bilans')} accessibilityRole="button">
            <Text style={styles.boutonTexte}>Bilans, aliments, caféine, montre →</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: couleurs.fond },
  entete: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: espace(4), paddingVertical: espace(3) },
  titre: { color: couleurs.encre, fontSize: 26, fontWeight: '800' },
  fermer: { color: couleurs.vert, fontSize: 16, fontWeight: '700' },
  contenu: { paddingHorizontal: espace(4), paddingBottom: espace(8), gap: espace(3) },
  resume: { color: couleurs.encre, fontSize: 17, fontWeight: '700' },
  grille: { flexDirection: 'row', flexWrap: 'wrap', gap: espace(2) },
  tuile: { width: '48.5%', borderRadius: 16, borderWidth: 1.5, padding: espace(3), gap: 2, minHeight: 110 },
  nom: { color: couleurs.encre, fontSize: 14, fontWeight: '600' },
  valeur: { fontSize: 24, fontWeight: '900', fontVariant: ['tabular-nums'] },
  evolution: { color: couleurs.doux, fontSize: 14, fontWeight: '700' },
  mieux: { color: couleurs.vert },
  moins: { color: couleurs.rouge },
  aide: { color: couleurs.doux, fontSize: 14, lineHeight: 19 },
  bouton: { borderRadius: 14, borderWidth: 1.5, borderColor: couleurs.vert, paddingVertical: espace(3), alignItems: 'center' },
  boutonTexte: { color: couleurs.vert, fontSize: 16, fontWeight: '800' },
});

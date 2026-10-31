import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { MOINS_UN_PAR_JOUR, MOINS_UN_PAR_SEMAINE, MOINS_UN_TOUS_LES_2_JOURS, PALIERS_LIBRES, type Parcours, type ReductionStrategy } from '../domain';
import { couleurs, espace } from './theme';

/**
 * « Où j'en suis » (RM-32) : l'étape de la méthode, une phrase, et UNE prochaine action. Chaque
 * passage d'étape est confirmé ; rien ne baisse tout seul avant l'étape 4.
 */
interface Props {
  parcours: Parcours;
  onMaximum: (quota: number) => void;
  onStabiliser: () => void;
  onRythme: (s: ReductionStrategy) => void;
}

export function CarteParcours({ parcours: p, onMaximum, onStabiliser, onRythme }: Props) {
  const [ouvert, setOuvert] = useState(false);
  const agir = () => {
    const a = p.action;
    if (a.cle === 'imposer')
      Alert.alert(`Imposer ${a.quota} par jour ?`, 'Dès aujourd’hui (les cigarettes déjà fumées comptent). Le maximum ne pourra que descendre.', [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Imposer', onPress: () => onMaximum(a.quota) },
      ]);
    else if (a.cle === 'descendre')
      Alert.alert(`Descendre à ${a.quota} par jour ?`, 'Dès aujourd’hui. Tu ne pourras plus remonter au-dessus.', [
        { text: 'Pas encore', style: 'cancel' },
        { text: 'Descendre', onPress: () => onMaximum(a.quota) },
      ]);
    else if (a.cle === 'moins-un')
      Alert.alert('Passer aux lots et au −1', 'Le maximum baissera tout seul à partir de demain. À quel rythme ?', [
        { text: '−1 par semaine', onPress: () => onRythme(MOINS_UN_PAR_SEMAINE) },
        { text: '−1 tous les 2 jours', onPress: () => onRythme(MOINS_UN_TOUS_LES_2_JOURS) },
        { text: '−1 par jour', onPress: () => onRythme(MOINS_UN_PAR_JOUR) },
      ]);
  };
  const secondaire = () => {
    if (p.secondaire?.cle === 'stabiliser')
      Alert.alert('Stabiliser à ce niveau ?', `Tu gardes ${p.maximum} par jour et tu travailles les contextes qui persistent. Aucune baisse automatique.`, [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Stabiliser', onPress: onStabiliser },
      ]);
    else if (p.secondaire?.cle === 'paliers-libres')
      Alert.alert('Revenir aux paliers libres ?', 'À partir de demain, le maximum ne baisse plus tout seul : c’est toi qui décides.', [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Revenir', onPress: () => onRythme(PALIERS_LIBRES) },
      ]);
  };
  const actionVisible = p.action.cle !== 'aucune';
  return (
    <View style={styles.carte}>
      <Pressable onPress={() => setOuvert(!ouvert)} accessibilityRole="button" accessibilityState={{ expanded: ouvert }}>
        <View style={styles.entete}>
          <Text style={styles.petit}>
            Où j’en suis · étape {p.etape} sur 4 · {p.etapes[p.etape - 1]!.nom}
          </Text>
          <Text style={styles.chevron}>{ouvert ? '▴' : '▾'}</Text>
        </View>
        <View style={styles.etapes}>
          {p.etapes.map((e) => (
            <View key={e.numero} style={[styles.etape, e.statut === 'fait' && styles.fait, e.statut === 'en-cours' && styles.enCours]}>
              <Text style={[styles.etapeTexte, e.statut !== 'a-venir' && styles.etapeTexteActif]} numberOfLines={1}>
                {e.statut === 'fait' ? '✓' : e.numero} {e.nom}
              </Text>
            </View>
          ))}
        </View>
      </Pressable>
      <Text style={styles.constat}>{p.constat}</Text>
      {actionVisible ? (
        <Pressable style={styles.bouton} onPress={agir} accessibilityRole="button">
          <Text style={styles.boutonTexte}>{p.action.texte}</Text>
        </Pressable>
      ) : (
        <Text style={styles.aide}>→ {p.action.texte}</Text>
      )}
      {ouvert && (
        <View style={styles.detail}>
          {p.semaine && (
            <Text style={styles.aide}>
              Maximum tenu {p.semaine.tenus} jour{p.semaine.tenus > 1 ? 's' : ''} sur {p.semaine.jours} (7 derniers jours).
            </Text>
          )}
          {p.persistants.length > 0 && <Text style={styles.aide}>Contextes qui persistent : {p.persistants.join(', ')} (parades dans Progrès).</Text>}
          <Text style={styles.aide}>
            Méthode : observer, descendre par paliers jusqu’à ta limite, stabiliser, puis lots et −1. Jamais au-dessus du palier précédent.
          </Text>
          {p.secondaire && (
            <Pressable onPress={secondaire} accessibilityRole="button" hitSlop={6}>
              <Text style={styles.lien}>{p.secondaire.texte}</Text>
            </Pressable>
          )}
        </View>
      )}
      {!ouvert && p.secondaire && (
        <Pressable onPress={secondaire} accessibilityRole="button" hitSlop={6}>
          <Text style={styles.lien}>{p.secondaire.texte}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  carte: { backgroundColor: couleurs.carte, borderRadius: 18, borderWidth: 1, borderColor: couleurs.ligne, padding: espace(3), marginTop: espace(2), gap: espace(2) },
  entete: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  petit: { color: couleurs.doux, fontSize: 13, fontWeight: '800', textTransform: 'uppercase', flexShrink: 1 },
  chevron: { color: couleurs.doux, fontSize: 14 },
  etapes: { flexDirection: 'row', gap: 4, marginTop: espace(2) },
  etape: { flex: 1, borderRadius: 8, paddingVertical: 4, paddingHorizontal: 2, alignItems: 'center', backgroundColor: couleurs.fond },
  fait: { backgroundColor: couleurs.vertClair },
  enCours: { backgroundColor: couleurs.vert },
  etapeTexte: { color: couleurs.doux, fontSize: 11, fontWeight: '700' },
  etapeTexteActif: { color: couleurs.encre },
  constat: { color: couleurs.encre, fontSize: 15, fontWeight: '600' },
  bouton: { backgroundColor: couleurs.vertClair, borderRadius: 12, paddingVertical: espace(2), paddingHorizontal: espace(3), alignItems: 'center', borderWidth: 1.5, borderColor: couleurs.vert },
  boutonTexte: { color: couleurs.vert, fontSize: 15, fontWeight: '800', textAlign: 'center' },
  aide: { color: couleurs.doux, fontSize: 14, lineHeight: 19 },
  lien: { color: couleurs.vert, fontSize: 14, fontWeight: '700', textDecorationLine: 'underline' },
  detail: { gap: espace(1) },
});

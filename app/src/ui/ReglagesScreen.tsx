import { useState, type ReactNode } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Reglages } from '../application/declic';
import { MOINS_UN_PAR_JOUR, MOINS_UN_PAR_SEMAINE, MOINS_UN_TOUS_LES_2_JOURS, PALIERS_LIBRES, type ReductionStrategy } from '../domain';
import { libelleVersion } from './BandeauMiseAJour';
import { couleurs, espace } from './theme';

interface Props {
  reglages: Reglages;
  onFermer: () => void;
  onPrix: (prixPaquetCents: number, cigarettesParPaquet: number) => void;
  onIntervalle: (minutes: number) => void;
  onObservation: (jours: number) => void;
  onRythme: (s: ReductionStrategy) => void;
  onPalier: (quota: number) => void;
  /** Impose un maximum de cigarettes par jour dès aujourd'hui (RM-30). */
  onMaximum: (quota: number) => void;
  onRenommerContexte: (cle: `perso:${string}`, libelle: string) => void;
  onArchiverContexte: (cle: `perso:${string}`) => void;
  onDemarrerPlan: () => void;
  onExporter: () => void;
  onSauvegarder: () => void;
  onRestaurer: () => void;
  onImporter: () => void;
  onEffacer: () => void;
  /** Cartes supplémentaires (coach IA). */
  extra?: ReactNode;
}

const INTERVALLES = [30, 45, 60, 90, 120];
const RYTHMES: { libelle: string; strategie: ReductionStrategy }[] = [
  { libelle: 'Paliers libres (je choisis)', strategie: PALIERS_LIBRES },
  { libelle: '−1 par jour', strategie: MOINS_UN_PAR_JOUR },
  { libelle: '−1 tous les 2 jours', strategie: MOINS_UN_TOUS_LES_2_JOURS },
  { libelle: '−1 par semaine', strategie: MOINS_UN_PAR_SEMAINE },
];

const memeStrategie = (a: ReductionStrategy | null, b: ReductionStrategy) => a !== null && a.pas === b.pas && a.periodeJours === b.periodeJours;

function Choix({ libelle, actif, onPress }: { libelle: string; actif: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.choix, actif && styles.choixActif]} onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: actif }}>
      <Text style={[styles.choixTexte, actif && styles.choixTexteActif]}>{libelle}</Text>
    </Pressable>
  );
}

/** Descente par paliers libres : un nouveau palier, toujours plus bas, appliqué dès aujourd'hui. */
/** Maximum par jour (RM-30), avant le plan : 15 par défaut, imposé dès la journée en cours. */
function Maximum({ onMaximum }: { onMaximum: (quota: number) => void }) {
  const [saisie, setSaisie] = useState('15');
  const n = Number(saisie);
  const valide = Number.isInteger(n) && n >= 1 && n <= 100;
  return (
    <View style={styles.carte}>
      <Text style={styles.petit}>Mon maximum par jour</Text>
      <View style={styles.ligne}>
        <TextInput
          style={[styles.champ, styles.flex]}
          value={saisie}
          onChangeText={setSaisie}
          keyboardType="number-pad"
          maxLength={3}
          accessibilityLabel="Maximum de cigarettes par jour"
        />
        <Pressable
          style={[styles.petitBouton, !valide && styles.inactif]}
          disabled={!valide}
          onPress={() =>
            Alert.alert(
              `Imposer ${n} par jour ?`,
              'Dès aujourd’hui : les cigarettes déjà fumées comptent. L’observation s’arrête (elle reste dans l’historique). Le maximum ne pourra que descendre.',
              [
                { text: 'Annuler', style: 'cancel' },
                { text: 'Imposer', onPress: () => onMaximum(n) },
              ],
            )
          }
          accessibilityRole="button"
        >
          <Text style={styles.petitBoutonTexte}>Imposer</Text>
        </Pressable>
      </View>
      <Text style={styles.aide}>C’est ton premier palier : l’intervalle conseillé étale ce maximum sur ta journée d’éveil. Rien n’est bloqué si tu le dépasses.</Text>
    </View>
  );
}

function Palier({ actuel, onPalier }: { actuel: number | null; onPalier: (quota: number) => void }) {
  const [saisie, setSaisie] = useState('');
  if (actuel === null) return null;
  const n = Number(saisie);
  const valide = saisie.trim() !== '' && Number.isInteger(n) && n >= 0 && n < actuel;
  return (
    <View style={styles.palier}>
      <Text style={styles.libelle}>Maximum actuel : {actuel} par jour</Text>
      <View style={styles.ligne}>
        <TextInput
          style={[styles.champ, styles.flex]}
          value={saisie}
          onChangeText={setSaisie}
          keyboardType="number-pad"
          placeholder={`Nouveau palier (moins de ${actuel})`}
          accessibilityLabel="Nouveau palier par jour"
        />
        <Pressable
          style={[styles.petitBouton, !valide && styles.inactif]}
          disabled={!valide}
          onPress={() =>
            Alert.alert(`Descendre à ${n} par jour ?`, 'Dès aujourd’hui. Tu ne pourras plus remonter au-dessus de ce palier ; le plan reste à ce niveau jusqu’à ton prochain choix.', [
              { text: 'Annuler', style: 'cancel' },
              {
                text: 'Descendre',
                onPress: () => {
                  onPalier(n);
                  setSaisie('');
                },
              },
            ])
          }
          accessibilityRole="button"
        >
          <Text style={styles.petitBoutonTexte}>Descendre</Text>
        </Pressable>
      </View>
      <Text style={styles.aide}>Descends par paliers jusqu’à trouver ta limite, stabilise-toi, puis passe à « −1 par jour ».</Text>
    </View>
  );
}

function LigneContexte({ cle, libelle, onRenommer, onArchiver }: { cle: `perso:${string}`; libelle: string; onRenommer: Props['onRenommerContexte']; onArchiver: Props['onArchiverContexte'] }) {
  const [saisie, setSaisie] = useState<string | null>(null);
  const texte = saisie?.trim() ?? '';
  if (saisie !== null) {
    return (
      <View style={styles.ligneContexte}>
        <TextInput style={[styles.champ, styles.flex]} value={saisie} onChangeText={setSaisie} maxLength={30} autoFocus accessibilityLabel="Nouveau nom du contexte" />
        <Pressable
          style={[styles.petitBouton, texte.length === 0 && styles.inactif]}
          disabled={texte.length === 0}
          onPress={() => {
            onRenommer(cle, texte);
            setSaisie(null);
          }}
          accessibilityRole="button"
        >
          <Text style={styles.petitBoutonTexte}>OK</Text>
        </Pressable>
      </View>
    );
  }
  return (
    <View style={styles.ligneContexte}>
      <Text style={[styles.valeurContexte, styles.flex]}>{libelle}</Text>
      <Pressable onPress={() => setSaisie(libelle)} accessibilityRole="button" hitSlop={6}>
        <Text style={styles.lien}>Renommer</Text>
      </Pressable>
      <Pressable
        onPress={() =>
          Alert.alert(`Retirer « ${libelle} » ?`, 'Il ne sera plus proposé. Les cigarettes passées le gardent.', [
            { text: 'Annuler', style: 'cancel' },
            { text: 'Retirer', style: 'destructive', onPress: () => onArchiver(cle) },
          ])
        }
        accessibilityRole="button"
        hitSlop={6}
      >
        <Text style={styles.lienRouge}>Retirer</Text>
      </Pressable>
    </View>
  );
}

export function ReglagesScreen(props: Props) {
  const { reglages: r, onFermer } = props;
  const [prix, setPrix] = useState((r.prixPaquetCents / 100).toFixed(2).replace('.', ','));
  const [parPaquet, setParPaquet] = useState(String(r.cigarettesParPaquet));
  const prixCents = Math.round(Number.parseFloat(prix.replace(',', '.')) * 100);
  const paquet = Number.parseInt(parPaquet, 10);
  const prixValide = prixCents > 0 && paquet > 0;
  const prixChange = prixValide && (prixCents !== r.prixPaquetCents || paquet !== r.cigarettesParPaquet);

  return (
    <Modal visible animationType="slide" onRequestClose={onFermer}>
      <SafeAreaView style={styles.page} edges={['top', 'bottom']}>
        <View style={styles.entete}>
          <Text style={styles.titre}>Réglages</Text>
          <Pressable onPress={onFermer} accessibilityRole="button" hitSlop={10}>
            <Text style={styles.fermer}>Fermer</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.contenu} keyboardShouldPersistTaps="handled">
          <View style={styles.carte}>
            <Text style={styles.petit}>Prix du paquet</Text>
            <View style={styles.ligne}>
              <View style={styles.flex}>
                <Text style={styles.libelle}>Prix (€)</Text>
                <TextInput style={styles.champ} value={prix} onChangeText={setPrix} keyboardType="decimal-pad" accessibilityLabel="Prix du paquet" />
              </View>
              <View style={styles.flex}>
                <Text style={styles.libelle}>Cigarettes / paquet</Text>
                <TextInput style={styles.champ} value={parPaquet} onChangeText={setParPaquet} keyboardType="number-pad" accessibilityLabel="Cigarettes par paquet" />
              </View>
            </View>
            <Pressable
              style={[styles.bouton, !prixChange && styles.inactif]}
              disabled={!prixChange}
              onPress={() => props.onPrix(prixCents, paquet)}
              accessibilityRole="button"
            >
              <Text style={styles.boutonTexte}>Enregistrer le prix</Text>
            </Pressable>
            <Text style={styles.aide}>Le nouveau prix s’applique à partir d’aujourd’hui ; les économies passées ne changent pas.</Text>
          </View>

          {!r.planDemarre && <Maximum onMaximum={props.onMaximum} />}
          {!r.planDemarre ? (
            <View style={styles.carte}>
              <Text style={styles.petit}>Observation</Text>
              <Text style={styles.libelle}>Durée : journées complètes mesurées avant le plan</Text>
              <View style={styles.grille}>
                {[1, 2, 3, 4, 5, 6, 7].map((j) => (
                  <Choix key={j} libelle={j === 7 ? '1 sem.' : `${j} j`} actif={r.joursObservation === j} onPress={() => props.onObservation(j)} />
                ))}
              </View>
              <Text style={styles.libelle}>Intervalle recommandé entre deux cigarettes</Text>
              <View style={styles.grille}>
                {INTERVALLES.map((m) => (
                  <Choix key={m} libelle={m < 60 ? `${m} min` : m === 60 ? '1 h' : m === 90 ? '1 h 30' : '2 h'} actif={r.intervalleRecommande === m} onPress={() => props.onIntervalle(m)} />
                ))}
              </View>
              <Pressable
                style={[styles.bouton, styles.boutonSecondaire]}
                onPress={() =>
                  Alert.alert('Démarrer le plan maintenant ?', 'Le plan partira de ta consommation déclarée, sans attendre la fin de l’observation.', [
                    { text: 'Annuler', style: 'cancel' },
                    { text: 'Démarrer', onPress: props.onDemarrerPlan },
                  ])
                }
                accessibilityRole="button"
              >
                <Text style={[styles.boutonTexte, styles.boutonTexteSecondaire]}>Démarrer le plan maintenant</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.carte}>
              <Text style={styles.petit}>Rythme de réduction</Text>
              <View style={styles.grille}>
                {RYTHMES.map((x) => (
                  <Choix key={x.libelle} libelle={x.libelle} actif={memeStrategie(r.strategie, x.strategie)} onPress={() => props.onRythme(x.strategie)} />
                ))}
              </View>
              <Text style={styles.aide}>Le nouveau rythme s’applique à partir de demain.</Text>
              <Palier actuel={r.palierActuel} onPalier={props.onPalier} />
            </View>
          )}

          <View style={styles.carte}>
            <Text style={styles.petit}>Mes contextes</Text>
            {r.contextesPerso.length === 0 ? (
              <Text style={styles.aide}>Ajoute tes propres contextes avec « + Ajouter un contexte » après « J’ai fumé ».</Text>
            ) : (
              r.contextesPerso.map((c) => (
                <LigneContexte key={c.cle} cle={c.cle} libelle={c.libelle} onRenommer={props.onRenommerContexte} onArchiver={props.onArchiverContexte} />
              ))
            )}
          </View>

          {props.extra}

          <View style={styles.carte}>
            <Text style={styles.petit}>Mes données</Text>
            <Text style={styles.aide}>
              Elles restent sur ce téléphone. Sauvegarde-les régulièrement dans un fichier (Téléchargements, Google Drive…) : en cas de
              perte ou de changement de téléphone, tu les restaures en un geste.
            </Text>
            <Pressable style={styles.bouton} onPress={props.onSauvegarder} accessibilityRole="button">
              <Text style={styles.boutonTexte}>Sauvegarder dans un fichier</Text>
            </Pressable>
            <Pressable style={[styles.bouton, styles.boutonSecondaire]} onPress={props.onRestaurer} accessibilityRole="button">
              <Text style={[styles.boutonTexte, styles.boutonTexteSecondaire]}>Restaurer une sauvegarde</Text>
            </Pressable>
            <Pressable style={[styles.bouton, styles.boutonSecondaire]} onPress={props.onImporter} accessibilityRole="button">
              <Text style={[styles.boutonTexte, styles.boutonTexteSecondaire]}>Importer un historique (avec aperçu)</Text>
            </Pressable>
            <Text style={styles.aide}>
              Restaurer remplace tout ; importer ajoute un historique (journal tenu à part) à tes saisies, après un aperçu à valider.
            </Text>
            <Pressable style={styles.effacer} onPress={props.onExporter} accessibilityRole="button">
              <Text style={styles.lien}>Partager mes données (texte)</Text>
            </Pressable>
            <Pressable style={styles.effacer} onPress={props.onEffacer} accessibilityRole="button">
              <Text style={styles.lienRouge}>Effacer toutes mes données</Text>
            </Pressable>
          </View>
          <Text style={styles.mention}>Déclic ne remplace pas un avis médical · Tabac Info Service : 39 89</Text>
          <Text style={styles.mention}>{libelleVersion('0.1.0')}</Text>
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
  carte: { backgroundColor: couleurs.carte, borderRadius: 18, borderWidth: 1, borderColor: couleurs.ligne, padding: espace(4), gap: espace(2) },
  petit: { color: couleurs.doux, fontSize: 15, fontWeight: '700', textTransform: 'uppercase' },
  libelle: { color: couleurs.encre, fontSize: 14, fontWeight: '600', marginBottom: espace(1) },
  ligne: { flexDirection: 'row', gap: espace(3) },
  flex: { flex: 1 },
  champ: { borderWidth: 1, borderColor: couleurs.ligne, borderRadius: 12, paddingHorizontal: espace(3), paddingVertical: espace(2), fontSize: 16, color: couleurs.encre, backgroundColor: couleurs.fond },
  grille: { flexDirection: 'row', flexWrap: 'wrap', gap: espace(2) },
  choix: { borderRadius: 999, borderWidth: 1.5, borderColor: couleurs.vert, paddingHorizontal: espace(4), paddingVertical: espace(2) },
  choixActif: { backgroundColor: couleurs.vert },
  choixTexte: { color: couleurs.vert, fontSize: 15, fontWeight: '600' },
  choixTexteActif: { color: '#FFFFFF' },
  bouton: { backgroundColor: couleurs.vert, borderRadius: 14, paddingVertical: espace(3), alignItems: 'center', marginTop: espace(1) },
  boutonSecondaire: { backgroundColor: couleurs.carte, borderWidth: 2, borderColor: couleurs.vert },
  boutonTexte: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  boutonTexteSecondaire: { color: couleurs.vert },
  inactif: { opacity: 0.4 },
  aide: { color: couleurs.doux, fontSize: 15, lineHeight: 18 },
  ligneContexte: { flexDirection: 'row', alignItems: 'center', gap: espace(3), paddingVertical: espace(1) },
  valeurContexte: { color: couleurs.encre, fontSize: 16 },
  lien: { color: couleurs.vert, fontSize: 14, textDecorationLine: 'underline' },
  lienRouge: { color: couleurs.rouge, fontSize: 14, textDecorationLine: 'underline' },
  petitBouton: { backgroundColor: couleurs.vert, borderRadius: 10, paddingHorizontal: espace(4), paddingVertical: espace(2) },
  petitBoutonTexte: { color: '#FFFFFF', fontWeight: '700' },
  effacer: { alignItems: 'center', paddingTop: espace(2) },
  palier: { gap: espace(2), marginTop: espace(2), paddingTop: espace(3), borderTopWidth: 1, borderTopColor: couleurs.ligne },
  mention: { color: couleurs.doux, fontSize: 14, textAlign: 'center' },
});

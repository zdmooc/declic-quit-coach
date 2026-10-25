import { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatDuree, formatEuros, type CigaretteHistorique, type ContextePerso, type JourneeHistorique } from '../domain';
import { ContexteSheet, type Precision } from './ContexteSheet';
import { couleurs, espace } from './theme';

interface Props {
  journees: JourneeHistorique[];
  tz: string;
  onFermer: () => void;
  contextesPerso: readonly ContextePerso[];
  /** Change le contexte d'une cigarette passée (ou en ajoute un nouveau). */
  onPreciser: (cigaretteId: string, precision: Precision) => void;
  onSupprimer: (cigaretteId: string) => void;
}

const heure = (t: number, tz: string) =>
  new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: tz }).format(t);

const jourCourt = (jour: string) =>
  new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', timeZone: 'UTC' }).format(Date.parse(`${jour}T12:00:00Z`));

const jourLong = (jour: string) =>
  new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(
    Date.parse(`${jour}T12:00:00Z`),
  );

const HAUTEUR_GRAPHE = 120;

/** Graphique des 14 dernières journées : barres = cigarettes fumées, trait = quota. */
function Graphe({ journees }: { journees: JourneeHistorique[] }) {
  const jours = [...journees].slice(0, 14).reverse();
  const max = Math.max(1, ...jours.map((j) => Math.max(j.total, j.quota ?? 0)));
  return (
    <View style={styles.graphe} accessible accessibilityLabel="Cigarettes fumées par jour, 14 derniers jours">
      {jours.map((j) => {
        const depasse = j.quota !== null && j.fumees > j.quota;
        return (
          <View key={j.jour} style={styles.colonne}>
            <Text style={styles.valeurBarre}>{j.total}</Text>
            <View style={styles.zoneBarre}>
              {j.quota !== null && <View style={[styles.quota, { bottom: (j.quota / max) * HAUTEUR_GRAPHE }]} />}
              <View
                style={[
                  styles.barre,
                  { height: Math.max(2, (j.total / max) * HAUTEUR_GRAPHE) },
                  depasse ? styles.barreRouge : j.quota !== null ? styles.barreVerte : styles.barreNeutre,
                ]}
              />
            </View>
            <Text style={styles.jourBarre} numberOfLines={1}>
              {jourCourt(j.jour)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function LigneCigarette({
  c,
  tz,
  onChangerContexte,
  onSupprimer,
}: { c: CigaretteHistorique; tz: string; onChangerContexte: (id: string) => void } & Pick<Props, 'onSupprimer'>) {
  const confirmer = () =>
    Alert.alert('Supprimer cette cigarette ?', `Cigarette de ${heure(c.a, tz)}`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: () => onSupprimer(c.id) },
    ]);
  return (
    <View style={styles.ligne}>
      <View style={[styles.point, c.respectee === true && styles.pointVert, c.respectee === false && styles.pointRouge]} />
      <Text style={styles.heure}>{c.precision === 'approximative' ? '~' : ''}{heure(c.a, tz)}</Text>
      <Pressable style={styles.contexte} onPress={() => onChangerContexte(c.id)} accessibilityRole="button" hitSlop={6}>
        <Text style={[styles.contexteTexte, !c.libelleContexte && styles.contexteVide]} numberOfLines={1}>
          {c.libelleContexte ?? '+ contexte'}
          {c.avantPlan ? ' · avant le plan' : ''}
        </Text>
      </Pressable>
      <Pressable onPress={confirmer} accessibilityRole="button" accessibilityLabel={`Supprimer la cigarette de ${heure(c.a, tz)}`} hitSlop={8}>
        <Text style={styles.supprimer}>Supprimer</Text>
      </Pressable>
    </View>
  );
}

export function HistoriqueScreen({ journees, tz, contextesPerso, onFermer, onPreciser, onSupprimer }: Props) {
  const [ouvert, setOuvert] = useState<string | null>(journees[0]?.jour ?? null);
  const [enEdition, setEnEdition] = useState<string | null>(null);
  const onChangerContexte = (id: string) => setEnEdition(id);
  return (
    <Modal visible animationType="slide" onRequestClose={onFermer}>
      <SafeAreaView style={styles.page} edges={['top', 'bottom']}>
        <View style={styles.entete}>
          <Text style={styles.titre}>Historique</Text>
          <Pressable onPress={onFermer} accessibilityRole="button" hitSlop={10}>
            <Text style={styles.fermer}>Fermer</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.contenu}>
          <View style={styles.carte}>
            <Text style={styles.petit}>14 derniers jours</Text>
            <Graphe journees={journees} />
            <Text style={styles.legende}>Barre verte : quota tenu · rouge : quota dépassé · trait : quota</Text>
          </View>

          {journees.map((j) => {
            const estOuvert = ouvert === j.jour;
            return (
              <View key={j.jour} style={styles.carte}>
                <Pressable onPress={() => setOuvert(estOuvert ? null : j.jour)} accessibilityRole="button" accessibilityState={{ expanded: estOuvert }}>
                  <View style={styles.enteteJour}>
                    <Text style={styles.jour}>{jourLong(j.jour)}</Text>
                    <Text style={styles.chevron}>{estOuvert ? '▲' : '▼'}</Text>
                  </View>
                  <Text style={styles.resume}>
                    {j.quota !== null ? `${j.fumees} / ${j.quota}` : `${j.total} fumée${j.total > 1 ? 's' : ''}`}
                    {j.quota !== null && j.total !== j.fumees ? ` (${j.total} au total)` : ''}
                    {'  ·  '}
                    <Text style={styles.vert}>{j.respectees} tenu{j.respectees > 1 ? 's' : ''}</Text>
                    {'  ·  '}
                    <Text style={j.nonRespectees > 0 ? styles.rouge : undefined}>{j.nonRespectees} trop tôt</Text>
                    {j.envies > 0 ? `  ·  ${j.envies} envie${j.envies > 1 ? 's' : ''} résistée${j.envies > 1 ? 's' : ''}` : ''}
                    {j.economieCents !== null ? `  ·  ${formatEuros(j.economieCents)}` : ''}
                  </Text>
                  {(j.sansHeure > 0 || j.enviesSignalees > 0) && (
                    <Text style={styles.sousResume}>
                      {j.sansHeure > 0 ? `${j.sansHeure} sans heure connue (historique importé)` : ''}
                      {j.sansHeure > 0 && j.enviesSignalees > 0 ? ' · ' : ''}
                      {j.enviesSignalees > 0 ? `${j.enviesSignalees} envie${j.enviesSignalees > 1 ? 's' : ''} signalée${j.enviesSignalees > 1 ? 's' : ''}` : ''}
                    </Text>
                  )}
                  {j.intervalleMinutes !== null && (
                    <Text style={styles.sousResume}>
                      {j.enPlan ? 'Plan' : 'Observation'} · intervalle recommandé {formatDuree(j.intervalleMinutes)}
                    </Text>
                  )}
                </Pressable>
                {estOuvert &&
                  (j.cigarettes.length === 0 ? (
                    <Text style={styles.vide}>Aucune cigarette ce jour-là.</Text>
                  ) : (
                    j.cigarettes.map((c) => (
                      <LigneCigarette key={c.id} c={c} tz={tz} onChangerContexte={onChangerContexte} onSupprimer={onSupprimer} />
                    ))
                  ))}
              </View>
            );
          })}
        </ScrollView>
        {/* Rendue dans la fenêtre de l'historique pour s'afficher par-dessus (fenêtres imbriquées). */}
        <ContexteSheet
          visible={enEdition !== null}
          contextesPerso={contextesPerso}
          avecMoment={false}
          onChoisir={(p) => {
            const id = enEdition;
            setEnEdition(null);
            if (id && (p.contexte || p.nouveauContexte)) onPreciser(id, p);
          }}
        />
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
  carte: { backgroundColor: couleurs.carte, borderRadius: 18, borderWidth: 1, borderColor: couleurs.ligne, padding: espace(4) },
  petit: { color: couleurs.doux, fontSize: 13, fontWeight: '700', textTransform: 'uppercase', marginBottom: espace(2) },
  graphe: { flexDirection: 'row', alignItems: 'flex-end', gap: 3 },
  colonne: { flex: 1, alignItems: 'center' },
  valeurBarre: { color: couleurs.doux, fontSize: 10, marginBottom: 2, fontVariant: ['tabular-nums'] },
  zoneBarre: { height: HAUTEUR_GRAPHE, width: '100%', justifyContent: 'flex-end' },
  barre: { width: '100%', borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  barreVerte: { backgroundColor: couleurs.vert },
  barreRouge: { backgroundColor: couleurs.rouge },
  barreNeutre: { backgroundColor: couleurs.doux },
  quota: { position: 'absolute', left: -1, right: -1, height: 2, backgroundColor: couleurs.encre, zIndex: 1 },
  jourBarre: { color: couleurs.doux, fontSize: 9, marginTop: 3 },
  legende: { color: couleurs.doux, fontSize: 12, marginTop: espace(2) },
  enteteJour: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  jour: { color: couleurs.encre, fontSize: 17, fontWeight: '700', textTransform: 'capitalize' },
  chevron: { color: couleurs.doux, fontSize: 12 },
  resume: { color: couleurs.encre, fontSize: 14, marginTop: espace(1) },
  sousResume: { color: couleurs.doux, fontSize: 12, marginTop: 2 },
  vert: { color: couleurs.vert, fontWeight: '700' },
  rouge: { color: couleurs.rouge, fontWeight: '700' },
  vide: { color: couleurs.doux, marginTop: espace(3) },
  ligne: { flexDirection: 'row', alignItems: 'center', gap: espace(3), paddingVertical: espace(2), borderTopWidth: 1, borderTopColor: couleurs.ligne, marginTop: espace(2) },
  point: { width: 10, height: 10, borderRadius: 5, backgroundColor: couleurs.ligne },
  pointVert: { backgroundColor: couleurs.vert },
  pointRouge: { backgroundColor: couleurs.rouge },
  heure: { color: couleurs.encre, fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'], width: 48 },
  contexte: { flex: 1 },
  contexteTexte: { color: couleurs.vert, fontSize: 14, fontWeight: '600' },
  contexteVide: { color: couleurs.doux, fontWeight: '400' },
  supprimer: { color: couleurs.rouge, fontSize: 13, textDecorationLine: 'underline' },
});

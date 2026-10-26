import { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatDuree, formatEuros, serieConsommation, type CigaretteHistorique, type ContextePerso, type Granularite, type JourneeHistorique, type PointSerie } from '../domain';
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
  /** Corrige l'heure d'une cigarette (« HH:MM »). */
  onCorrigerHeure: (cigaretteId: string, hhmm: string) => void;
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

/** Graphique par jour (30 dernières journées), par semaine ou par mois (12 dernières). */
function Graphe({ journees }: { journees: JourneeHistorique[] }) {
  const [granularite, setGranularite] = useState<Granularite>('jour');
  const aujourdhui = journees[0]?.jour ?? '';
  // La première journée suivie est presque toujours partielle (suivi commencé en cours de journée).
  const premiere = [...journees].reverse().find((j) => j.total > 0 || j.enPlan)?.jour;
  const points = serieConsommation(journees, granularite, { aujourdhui, partielles: new Set(premiere ? [premiere] : []) });
  const valeur = (p: PointSerie) => (granularite === 'jour' ? p.total : p.moyenneParJour);
  const max = Math.max(1, ...points.map((p) => Math.max(valeur(p), p.quotaMoyen ?? 0)));
  const largeur = granularite === 'jour' ? 22 : undefined;
  const libelle = (p: PointSerie) =>
    granularite === 'jour' ? jourCourt(p.debut) : granularite === 'semaine' ? `${p.debut.slice(8)}/${p.debut.slice(5, 7)}` : MOIS[Number(p.debut.slice(5, 7)) - 1]!;
  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ','));
  const dernier = points[points.length - 1];
  const precedent = points[points.length - 2];
  const unite = granularite === 'jour' ? 'cette journée' : granularite === 'semaine' ? 'cette semaine' : 'ce mois-ci';
  const barres = points.map((p) => {
    const v = valeur(p);
    const depasse = p.quotaMoyen !== null && v > p.quotaMoyen;
    return (
      <View key={p.debut} style={[styles.colonne, largeur ? { width: largeur, flex: 0 } : null]}>
        <Text style={styles.valeurBarre}>{fmt(Math.round(v * 10) / 10)}</Text>
        <View style={styles.zoneBarre}>
          {p.quotaMoyen !== null && <View style={[styles.quota, { bottom: (p.quotaMoyen / max) * HAUTEUR_GRAPHE }]} />}
          <View
            style={[
              styles.barre,
              { height: Math.max(2, (v / max) * HAUTEUR_GRAPHE) },
              depasse ? styles.barreRouge : p.quotaMoyen !== null ? styles.barreVerte : styles.barreNeutre,
              p.incomplet && styles.barreIncomplete,
            ]}
          />
        </View>
        <Text style={styles.jourBarre} numberOfLines={1}>
          {libelle(p)}
          {p.incomplet ? '*' : ''}
        </Text>
      </View>
    );
  });
  return (
    <View>
      <View style={styles.onglets}>
        {(['jour', 'semaine', 'mois'] as const).map((g) => (
          <Pressable
            key={g}
            style={[styles.onglet, granularite === g && styles.ongletActif]}
            onPress={() => setGranularite(g)}
            accessibilityRole="tab"
            accessibilityState={{ selected: granularite === g }}
          >
            <Text style={[styles.ongletTexte, granularite === g && styles.ongletTexteActif]}>{g === 'jour' ? 'Jour' : g === 'semaine' ? 'Semaine' : 'Mois'}</Text>
          </Pressable>
        ))}
      </View>
      {points.length === 0 ? (
        <Text style={styles.legende}>Pas encore de données.</Text>
      ) : granularite === 'jour' ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.graphe} ref={(r) => r?.scrollToEnd({ animated: false })}>
          {barres}
        </ScrollView>
      ) : (
        <View style={styles.graphe}>{barres}</View>
      )}
      {dernier && (
        <Text style={styles.synthese}>
          {granularite === 'jour'
            ? `${dernier.total} cigarettes ${unite}`
            : `${fmt(Math.round(dernier.moyenneParJour * 10) / 10)} par jour ${unite} (${dernier.total} sur ${dernier.jours} j)`}
          {precedent
            ? ` · ${valeur(dernier) <= valeur(precedent) ? '−' : '+'}${fmt(Math.abs(Math.round((valeur(dernier) - valeur(precedent)) * 10) / 10))} vs ${granularite === 'jour' ? 'la veille' : granularite === 'semaine' ? 'la semaine d’avant' : 'le mois d’avant'}`
            : ''}
        </Text>
      )}
      <Text style={styles.legende}>
        {granularite === 'jour' ? 'Total réel par journée' : 'Moyenne par journée renseignée'} · vert : quota tenu · rouge : dépassé · trait : quota
        {points.some((p) => p.incomplet) ? ' · * période incomplète (pâle)' : ''}
      </Text>
    </View>
  );
}

const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

function LigneCigarette({
  c,
  tz,
  onChangerContexte,
  onSupprimer,
  onCorrigerHeure,
}: { c: CigaretteHistorique; tz: string; onChangerContexte: (id: string) => void } & Pick<Props, 'onSupprimer' | 'onCorrigerHeure'>) {
  const [saisie, setSaisie] = useState<string | null>(null);
  const confirmer = () =>
    Alert.alert('Supprimer cette cigarette ?', `Cigarette de ${heure(c.a, tz)}`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: () => onSupprimer(c.id) },
    ]);
  return (
    <View style={styles.ligne}>
      <View style={[styles.point, c.respectee === true && styles.pointVert, c.respectee === false && styles.pointRouge]} />
      {saisie === null ? (
        <Pressable onPress={() => setSaisie(heure(c.a, tz))} accessibilityRole="button" accessibilityLabel={`Modifier l’heure ${heure(c.a, tz)}`} hitSlop={6}>
          <Text style={[styles.heure, styles.heureModifiable]}>
            {c.precision === 'approximative' ? '~' : ''}
            {heure(c.a, tz)}
          </Text>
        </Pressable>
      ) : (
        <View style={styles.ligneHeure}>
          <TextInput
            style={styles.champHeure}
            value={saisie}
            onChangeText={setSaisie}
            keyboardType="numbers-and-punctuation"
            autoFocus
            selectTextOnFocus
            maxLength={5}
            accessibilityLabel="Nouvelle heure, format 08:45"
          />
          <Pressable
            onPress={() => {
              onCorrigerHeure(c.id, saisie);
              setSaisie(null);
            }}
            accessibilityRole="button"
            hitSlop={6}
          >
            <Text style={styles.ok}>OK</Text>
          </Pressable>
        </View>
      )}
      <Pressable style={styles.contexte} onPress={() => onChangerContexte(c.id)} accessibilityRole="button" hitSlop={6}>
        <Text style={[styles.contexteTexte, !c.libelleContexte && styles.contexteVide]} numberOfLines={1}>
          {c.libelleContexte ?? '+ contexte'}
          {c.avantPlan ? ' · avant le plan' : ''}
          {c.patchMg !== undefined ? ` · patch ${c.patchMg} mg` : ''}
        </Text>
      </Pressable>
      <Pressable onPress={confirmer} accessibilityRole="button" accessibilityLabel={`Supprimer la cigarette de ${heure(c.a, tz)}`} hitSlop={8}>
        <Text style={styles.supprimer}>Supprimer</Text>
      </Pressable>
    </View>
  );
}

export function HistoriqueScreen({ journees, tz, contextesPerso, onFermer, onPreciser, onSupprimer, onCorrigerHeure }: Props) {
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
            <Text style={styles.petit}>Consommation</Text>
            <Graphe journees={journees} />
          </View>

          {journees.slice(0, 60).map((j) => {
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
                  <Text style={styles.sousResume}>
                    {j.patchs.length === 0
                      ? 'Sans patch'
                      : j.patchs
                          .map((p) => `Patch ${p.dosageMg} mg · posé ${heure(p.poseA, tz)} · renouvellement ${heure(p.renouvellementPrevu, tz)}${p.retireA ? ` · retiré ${heure(p.retireA, tz)}` : ''}`)
                          .join('  |  ')}
                    {j.patchs.length > 0 && j.total > 0 ? `  ·  ${j.sousPatch} sous patch, ${j.total - j.sansHeure - j.sousPatch} sans` : ''}
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
                      <LigneCigarette key={c.id} c={c} tz={tz} onChangerContexte={onChangerContexte} onSupprimer={onSupprimer} onCorrigerHeure={onCorrigerHeure} />
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
  petit: { color: couleurs.doux, fontSize: 15, fontWeight: '700', textTransform: 'uppercase', marginBottom: espace(2) },
  graphe: { flexDirection: 'row', alignItems: 'flex-end', gap: 3 },
  colonne: { flex: 1, alignItems: 'center' },
  valeurBarre: { color: couleurs.doux, fontSize: 12, marginBottom: 2, fontVariant: ['tabular-nums'] },
  zoneBarre: { height: HAUTEUR_GRAPHE, width: '100%', justifyContent: 'flex-end' },
  barre: { width: '100%', borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  barreVerte: { backgroundColor: couleurs.vert },
  barreRouge: { backgroundColor: couleurs.rouge },
  barreNeutre: { backgroundColor: couleurs.doux },
  quota: { position: 'absolute', left: -1, right: -1, height: 2, backgroundColor: couleurs.encre, zIndex: 1 },
  jourBarre: { color: couleurs.doux, fontSize: 11, marginTop: 3 },
  legende: { color: couleurs.doux, fontSize: 14, marginTop: espace(2) },
  heureModifiable: { textDecorationLine: 'underline', textDecorationStyle: 'dotted' },
  ligneHeure: { flexDirection: 'row', alignItems: 'center', gap: espace(1) },
  champHeure: { width: 64, borderWidth: 1, borderColor: couleurs.vert, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2, fontSize: 15, color: couleurs.encre },
  ok: { color: couleurs.vert, fontWeight: '800', fontSize: 15 },
  synthese: { color: couleurs.encre, fontSize: 14, fontWeight: '600', marginTop: espace(2) },
  barreIncomplete: { opacity: 0.45 },
  onglets: { flexDirection: 'row', backgroundColor: couleurs.fond, borderRadius: 12, padding: 3, marginBottom: espace(3) },
  onglet: { flex: 1, paddingVertical: espace(2), borderRadius: 10, alignItems: 'center' },
  ongletActif: { backgroundColor: couleurs.carte },
  ongletTexte: { color: couleurs.doux, fontSize: 14, fontWeight: '600' },
  ongletTexteActif: { color: couleurs.vert, fontWeight: '800' },
  enteteJour: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  jour: { color: couleurs.encre, fontSize: 17, fontWeight: '700', textTransform: 'capitalize' },
  chevron: { color: couleurs.doux, fontSize: 14 },
  resume: { color: couleurs.encre, fontSize: 14, marginTop: espace(1) },
  sousResume: { color: couleurs.doux, fontSize: 14, marginTop: 2 },
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
  supprimer: { color: couleurs.rouge, fontSize: 15, textDecorationLine: 'underline' },
});

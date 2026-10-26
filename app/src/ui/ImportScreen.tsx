import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Apercu, Choix, ChoixDivergence, Divergence, Simulation } from '../application/migration';
import { couleurs, espace } from './theme';

/**
 * Aperçu avant import d'un historique : totaux par journée, rapprochements à trancher,
 * anomalies. Rien n'est écrit tant que « Importer » n'est pas pressé.
 */
interface Props {
  apercu: Apercu;
  simulation: Simulation;
  choix: Choix;
  tz: string;
  enCours: boolean;
  onChoix: (appId: string, choix: ChoixDivergence) => void;
  onConfirmer: () => void;
  onAnnuler: () => void;
}

const LIBELLES_TYPE: Record<string, string> = {
  CigaretteFumee: 'cigarettes horodatées',
  AgregatSansHeure: 'agrégats sans heure (cigarettes, envies)',
  EnvieResistee: 'envies résistées',
  EnvieSignalee: 'envies signalées',
  PatchPose: 'poses de patch',
  PatchRetire: 'retraits de patch',
  ContexteAjoute: 'contextes',
  CigaretteCorrigee: 'corrections',
  BilanSaisi: 'bilans biologiques',
  NormeDefinie: 'normes de bilan',
};
const JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const dateLongue = (j: string) => `${JOURS[new Date(`${j}T12:00:00Z`).getUTCDay()]} ${j.slice(8, 10)}/${j.slice(5, 7)}`;

function memeChoix(a: ChoixDivergence | undefined, b: ChoixDivergence): boolean {
  if (!a || a.action !== b.action) return false;
  return a.action === 'distinctes' || (b.action === 'meme' && a.journalId === b.journalId && a.garder === b.garder);
}

function Option({ libelle, actif, onPress }: { libelle: string; actif: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.option, actif && styles.optionActive]} onPress={onPress} accessibilityRole="radio" accessibilityState={{ checked: actif }}>
      <Text style={[styles.radio, actif && styles.radioActif]}>{actif ? '●' : '○'}</Text>
      <Text style={[styles.optionTexte, actif && styles.optionTexteActif]}>{libelle}</Text>
    </Pressable>
  );
}

function CarteDivergence({ d, choix, tz, onChoix }: { d: Divergence; choix: ChoixDivergence | undefined; tz: string; onChoix: Props['onChoix'] }) {
  const h = (t: number) => new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: tz }).format(t).replace(':', ' h ');
  const options: { libelle: string; choix: ChoixDivergence }[] = [];
  for (const c of d.candidats.slice(0, 2)) {
    const desc = `${h(c.heure)}${c.approximative ? ' (env.)' : ''}${c.contexte ? ` · ${c.contexte}` : ''} — écart ${c.ecartMinutes} min`;
    options.push({ libelle: `Même cigarette que ${desc} : garder l’heure du journal`, choix: { action: 'meme', journalId: c.id, garder: 'journal' } });
    options.push({ libelle: `Même cigarette que ${h(c.heure)} : garder l’heure de l’app (${h(d.heureApp)})`, choix: { action: 'meme', journalId: c.id, garder: 'app' } });
  }
  options.push({ libelle: 'Deux cigarettes distinctes : garder les deux', choix: { action: 'distinctes' } });
  return (
    <View style={[styles.carte, !choix && styles.carteAttente]}>
      <Text style={styles.titreDiv}>
        {dateLongue(d.jour)} · saisie de l’app à {h(d.heureApp)}
        {d.contexteApp ? ` (${d.contexteApp})` : ''}
      </Text>
      {options.map((o) => (
        <Option key={o.libelle} libelle={o.libelle} actif={memeChoix(choix, o.choix)} onPress={() => onChoix(d.appId, o.choix)} />
      ))}
    </View>
  );
}

export function ImportScreen({ apercu, simulation, choix, tz, enCours, onChoix, onConfirmer, onAnnuler }: Props) {
  const aAjouter = Object.entries(apercu.parType).filter(([, v]) => v.ajoutes > 0);
  const dejaPresents = Object.values(apercu.parType).reduce((s, v) => s + v.ignores, 0);
  const pret = !apercu.bloquant && simulation.restantes === 0 && simulation.erreurs.length === 0 && simulation.evenements.length > 0;
  const libelleBouton = apercu.bloquant
    ? 'Import impossible'
    : simulation.restantes > 0
      ? `Décide ${simulation.restantes} rapprochement${simulation.restantes > 1 ? 's' : ''} pour importer`
      : simulation.evenements.length === 0
        ? 'Rien à importer'
        : `Importer ${simulation.evenements.length} saisies`;

  return (
    <Modal visible animationType="slide" onRequestClose={onAnnuler}>
      <SafeAreaView style={styles.page} edges={['top', 'bottom']}>
        <View style={styles.entete}>
          <Text style={styles.titre}>Aperçu de l’import</Text>
          <Pressable onPress={onAnnuler} accessibilityRole="button" hitSlop={8}>
            <Text style={styles.fermer}>Annuler</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.contenu}>
          <Text style={styles.aide}>
            {apercu.meta ? `${apercu.meta.source} · du ${apercu.meta.periode.du.slice(8)}/${apercu.meta.periode.du.slice(5, 7)} au ${apercu.meta.periode.au.slice(8)}/${apercu.meta.periode.au.slice(5, 7)}` : `Sauvegarde Déclic v${apercu.version}`}
            {' · '}Rien n’est enregistré avant « Importer ». Tes saisies actuelles ne sont jamais modifiées ni supprimées.
          </Text>
          {apercu.bloquant && <Text style={styles.erreur}>{apercu.bloquant}</Text>}

          <View style={styles.carte}>
            <Text style={styles.petit}>Cigarettes par journée</Text>
            <View style={[styles.ligne, styles.ligneTete]}>
              <Text style={[styles.cJour, styles.tete]}>Journée</Text>
              <Text style={[styles.cNum, styles.tete]}>avant</Text>
              <Text style={[styles.cNum, styles.tete]}>après</Text>
              <Text style={[styles.cNum, styles.tete]}>source</Text>
            </View>
            {simulation.jours.map((j) => {
              const ecart = j.attendu !== null && j.attendu !== j.apres;
              return (
                <View key={j.jour} style={styles.blocJour}>
                  <View style={styles.ligne}>
                    <Text style={styles.cJour}>
                      {dateLongue(j.jour)}
                      {j.partielle ? ' · partielle' : ''}
                      {j.enCours ? ' · en cours' : ''}
                    </Text>
                    <Text style={styles.cNum}>{j.avant}</Text>
                    <Text style={[styles.cNum, styles.gras, ecart && styles.rouge]}>{j.apres}</Text>
                    <Text style={styles.cNum}>{j.attendu ?? '—'}</Text>
                  </View>
                  <Text style={styles.detail}>
                    {j.exactes} à l’heure exacte · {j.approximatives} approximatives · {j.sansHeure} sans heure
                  </Text>
                  <Text style={styles.detail}>
                    Envies : {j.enviesSignalees} signalées · {j.enviesResistees} résistées confirmées
                  </Text>
                </View>
              );
            })}
          </View>

          {apercu.divergences.length > 0 && (
            <>
              <Text style={styles.section}>
                À trancher ({apercu.divergences.length - simulation.restantes}/{apercu.divergences.length})
              </Text>
              <Text style={styles.aide}>Une saisie de l’app est proche d’une cigarette du journal. Est-ce la même ?</Text>
              {apercu.divergences.map((d) => (
                <CarteDivergence key={d.appId} d={d} choix={choix[d.appId]} tz={tz} onChoix={onChoix} />
              ))}
            </>
          )}

          <View style={styles.carte}>
            <Text style={styles.petit}>Contenu</Text>
            {aAjouter.map(([type, v]) => (
              <Text key={type} style={styles.detail}>
                + {v.ajoutes} {LIBELLES_TYPE[type] ?? type}
              </Text>
            ))}
            {dejaPresents > 0 && <Text style={styles.detail}>{dejaPresents} saisies déjà présentes sur ce téléphone, ignorées</Text>}
          </View>

          {(simulation.erreurs.length > 0 || apercu.anomalies.length > 0 || simulation.anomalies.length > 0) && (
            <View style={styles.carte}>
              <Text style={styles.petit}>Points d’attention</Text>
              {simulation.erreurs.map((a) => (
                <Text key={a} style={[styles.anomalie, styles.rouge]}>
                  ✗ {a}
                </Text>
              ))}
              {[...apercu.anomalies, ...simulation.anomalies].map((a) => (
                <Text key={a} style={styles.anomalie}>
                  • {a}
                </Text>
              ))}
            </View>
          )}
        </ScrollView>
        <View style={styles.pied}>
          <Pressable style={[styles.bouton, (!pret || enCours) && styles.inactif]} disabled={!pret || enCours} onPress={onConfirmer} accessibilityRole="button">
            <Text style={styles.boutonTexte}>{enCours ? 'Import…' : libelleBouton}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: couleurs.fond },
  entete: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: espace(4), paddingVertical: espace(3) },
  titre: { color: couleurs.encre, fontSize: 24, fontWeight: '800' },
  fermer: { color: couleurs.vert, fontSize: 16, fontWeight: '700' },
  contenu: { paddingHorizontal: espace(4), paddingBottom: espace(8), gap: espace(3) },
  carte: { backgroundColor: couleurs.carte, borderRadius: 18, borderWidth: 1, borderColor: couleurs.ligne, padding: espace(4), gap: espace(2) },
  carteAttente: { borderColor: couleurs.ambre, backgroundColor: couleurs.ambreClair },
  petit: { color: couleurs.doux, fontSize: 15, fontWeight: '700', textTransform: 'uppercase' },
  section: { color: couleurs.encre, fontSize: 17, fontWeight: '800', marginTop: espace(1) },
  aide: { color: couleurs.doux, fontSize: 15, lineHeight: 18 },
  ligne: { flexDirection: 'row', alignItems: 'center' },
  ligneTete: { borderBottomWidth: 1, borderBottomColor: couleurs.ligne, paddingBottom: espace(1) },
  tete: { color: couleurs.doux, fontSize: 14, fontWeight: '700' },
  blocJour: { paddingVertical: espace(1), borderBottomWidth: 1, borderBottomColor: couleurs.ligne, gap: 2 },
  cJour: { flex: 1, color: couleurs.encre, fontSize: 14, fontWeight: '600' },
  cNum: { width: 52, textAlign: 'right', color: couleurs.encre, fontSize: 15, fontVariant: ['tabular-nums'] },
  gras: { fontWeight: '800' },
  rouge: { color: couleurs.rouge },
  detail: { color: couleurs.doux, fontSize: 14 },
  titreDiv: { color: couleurs.encre, fontSize: 15, fontWeight: '700' },
  option: { flexDirection: 'row', gap: espace(2), alignItems: 'flex-start', paddingVertical: espace(1) },
  optionActive: {},
  radio: { color: couleurs.doux, fontSize: 16, width: 18 },
  radioActif: { color: couleurs.vert },
  optionTexte: { flex: 1, color: couleurs.encre, fontSize: 14, lineHeight: 19 },
  optionTexteActif: { fontWeight: '700', color: couleurs.vert },
  anomalie: { color: couleurs.encre, fontSize: 15, lineHeight: 18 },
  erreur: { color: couleurs.rouge, fontSize: 14, fontWeight: '700' },
  pied: { paddingHorizontal: espace(4), paddingTop: espace(2), paddingBottom: espace(2), borderTopWidth: 1, borderTopColor: couleurs.ligne },
  bouton: { backgroundColor: couleurs.vert, borderRadius: 14, paddingVertical: espace(4), alignItems: 'center' },
  boutonTexte: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  inactif: { opacity: 0.45 },
});

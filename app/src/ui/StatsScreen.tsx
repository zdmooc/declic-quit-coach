import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { PointJour, Statistiques, TableauDeBord } from '../domain';
import { couleurs, espace } from './theme';

/** Statistiques détaillées (RM-26). Les journées sans aucune saisie sont ignorées. */
interface Props {
  stats: Statistiques;
  tdb: TableauDeBord;
  onFermer: () => void;
}

const hhmm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(Math.round(m % 60)).padStart(2, '0')}`;
const duree = (m: number) => (m < 60 ? `${Math.round(m)} min` : `${Math.floor(m / 60)} h ${String(Math.round(m % 60)).padStart(2, '0')}`);
const virgule = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ','));
const jj = (j: string) => j.slice(8, 10);
const moy = (ps: readonly PointJour[]) => {
  const v = ps.map((p) => p.valeur).filter((x): x is number => x !== null);
  return v.length === 0 ? null : v.reduce((s, x) => s + x, 0) / v.length;
};

function Carte({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <View style={styles.carte}>
      <Text style={styles.petit}>{titre}</Text>
      {children}
    </View>
  );
}

/** Barres verticales par jour ; `bas` = une valeur basse est un progrès (rouge si haute). */
function Barres({ points, format, sens }: { points: readonly PointJour[]; format: (v: number) => string; sens: 'bas' | 'haut' | 'neutre' }) {
  const vals = points.map((p) => p.valeur).filter((x): x is number => x !== null);
  if (vals.length === 0) return <Text style={styles.aide}>Pas encore de données.</Text>;
  const max = Math.max(...vals);
  const min = Math.min(...vals);
  const couleur = (v: number) => {
    if (sens === 'neutre' || max === min) return couleurs.vert;
    const t = (v - min) / (max - min);
    const bon = sens === 'bas' ? 1 - t : t;
    return bon > 0.66 ? couleurs.vert : bon > 0.33 ? couleurs.ambre : couleurs.rouge;
  };
  return (
    <View style={styles.barres}>
      {points.map((p) => (
        <View key={p.jour} style={styles.colonne}>
          <Text style={styles.valeurBarre} numberOfLines={1} adjustsFontSizeToFit>
            {p.valeur === null ? '' : format(p.valeur)}
          </Text>
          <View style={styles.zoneBarre}>
            {p.valeur !== null && <View style={[styles.barre, { height: `${Math.max(4, (p.valeur / (max || 1)) * 100)}%`, backgroundColor: couleur(p.valeur) }]} />}
          </View>
          <Text style={styles.jourBarre}>{jj(p.jour)}</Text>
        </View>
      ))}
    </View>
  );
}

const TENDANCE = { baisse: '↓ en baisse', stable: '→ stable', hausse: '↑ en hausse', inconnue: 'pas encore assez de journées' } as const;

export function StatsScreen({ stats: s, tdb, onFermer }: Props) {
  const maxHeure = Math.max(...s.parHeure, 0.01);
  const moyJour = moy(s.parJour);
  const moyPremiere = moy(s.premiere);
  const moyDerniere = moy(s.derniere);
  const moyEcart = moy(s.moyenneDuJour);
  const moyNuit = moy(s.nuit);
  const techniques = tdb.techniquesSos.filter((t) => t.resistees + t.sansIssue > 0);
  return (
    <Modal visible animationType="slide" onRequestClose={onFermer}>
      <SafeAreaView style={styles.page} edges={['top', 'bottom']}>
        <View style={styles.entete}>
          <Text style={styles.titre}>Statistiques</Text>
          <Pressable onPress={onFermer} accessibilityRole="button" hitSlop={10}>
            <Text style={styles.fermer}>Fermer</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.contenu}>
          <Text style={styles.aide}>
            {s.jours} journée{s.jours > 1 ? 's' : ''} notée{s.jours > 1 ? 's' : ''} · graphiques sur les 14 derniers jours
          </Text>

          <Carte titre="1. Cigarettes par jour">
            <Barres points={s.parJour} format={(v) => String(v)} sens="bas" />
            <Text style={styles.texte}>
              {moyJour !== null ? `Moyenne : ${virgule(Math.round(moyJour * 10) / 10)} par jour · ` : ''}Tendance : {TENDANCE[s.tendance]}
            </Text>
            {s.parSemaine.length > 1 && (
              <Text style={styles.aide}>
                Par semaine : {s.parSemaine.map((w) => `${jj(w.lundi)}/${w.lundi.slice(5, 7)} ${virgule(Math.round(w.moyenne * 10) / 10)}`).join(' · ')}
              </Text>
            )}
          </Carte>

          <Carte titre="2. Heures où tu fumes">
            <View style={styles.heures}>
              {s.parHeure.map((n, h) => (
                <View key={h} style={styles.colonneHeure}>
                  <View style={styles.zoneHeure}>
                    <View style={[styles.barre, { height: `${(n / maxHeure) * 100}%`, backgroundColor: n === maxHeure ? couleurs.rouge : couleurs.vert }]} />
                  </View>
                  <Text style={styles.jourBarre}>{h % 3 === 0 ? h : ''}</Text>
                </View>
              ))}
            </View>
            <Text style={styles.aide}>Cigarettes par heure, en moyenne par journée. En rouge : l’heure la plus chargée.</Text>
          </Carte>

          <Carte titre="3. Semaine ou week-end">
            <Text style={styles.texte}>
              En semaine : {s.semaine === null ? '—' : `${virgule(Math.round(s.semaine * 10) / 10)} / jour`} · Week-end :{' '}
              {s.weekend === null ? '—' : `${virgule(Math.round(s.weekend * 10) / 10)} / jour`}
            </Text>
          </Carte>

          <Carte titre="4. Première et dernière cigarette">
            <Barres points={s.premiere} format={hhmm} sens="haut" />
            <Text style={styles.texte}>
              Première en moyenne à {moyPremiere === null ? '—' : hhmm(moyPremiere)} · dernière à {moyDerniere === null ? '—' : hhmm(moyDerniere)}
            </Text>
            <Text style={styles.aide}>Plus la première est tardive (barre haute, verte), plus tu repousses le réflexe du réveil.</Text>
          </Carte>

          <Carte titre="5. Moyenne du jour (hors nuit)">
            <Barres points={s.moyenneDuJour} format={(v) => duree(v)} sens="haut" />
            {moyEcart !== null && <Text style={styles.texte}>Écart moyen entre deux cigarettes : {duree(moyEcart)}</Text>}
          </Carte>

          <Carte titre="6. Nuit sans fumer">
            <Barres points={s.nuit} format={(v) => duree(v)} sens="haut" />
            {moyNuit !== null && <Text style={styles.texte}>Nuit moyenne : {duree(moyNuit)}</Text>}
            <Text style={styles.aide}>De la dernière cigarette du soir à la première du matin.</Text>
          </Carte>

          <Carte titre="7. Réveil → première cigarette">
            <Text style={styles.aide}>
              L’app ne connaît pas encore ton heure de réveil : en attendant, regarde l’heure de la première cigarette (4). Un bouton « Je suis
              réveillé » pourra mesurer ce délai exactement.
            </Text>
          </Carte>

          <Carte titre="8. Plus longue pause d’éveil">
            <Barres points={s.plusLonguePause} format={(v) => duree(v)} sens="haut" />
          </Carte>

          <Carte titre="9. Contextes (14 jours)">
            {s.contextes.length === 0 && <Text style={styles.aide}>Ajoute un contexte à tes cigarettes pour voir ce qui les déclenche.</Text>}
            {s.contextes.map((c) => (
              <View key={c.libelle} style={styles.ligneContexte}>
                <Text style={styles.texte}>
                  {c.libelle} · {Math.round(c.part * 100)} % ({c.nombre})
                </Text>
                <View style={styles.jauge}>
                  <View style={[styles.jaugePleine, { width: `${c.part * 100}%` }]} />
                </View>
                <Text style={styles.aide}>
                  Semaine d’avant : {c.avant} · cette semaine : {c.apres} {c.apres < c.avant ? '↓' : c.apres > c.avant ? '↑' : ''}
                </Text>
              </View>
            ))}
          </Carte>

          <Carte titre="10. Envies résistées">
            <View style={styles.barres}>
              {s.envies.map((e) => (
                <View key={e.jour} style={styles.colonne}>
                  <Text style={styles.valeurBarre}>{e.total > 0 ? `${e.resistees}/${e.total}` : ''}</Text>
                  <View style={styles.zoneBarre}>
                    {e.total > 0 && <View style={[styles.barre, { height: `${(e.resistees / e.total) * 100}%`, backgroundColor: couleurs.vert }]} />}
                  </View>
                  <Text style={styles.jourBarre}>{jj(e.jour)}</Text>
                </View>
              ))}
            </View>
          </Carte>

          <Carte titre="11. Techniques du SOS">
            {techniques.length === 0 ? (
              <Text style={styles.aide}>Pas encore de SOS utilisé.</Text>
            ) : (
              techniques.map((t) => (
                <Text key={t.cle} style={styles.texte}>
                  {t.nom} : {t.resistees} sur {t.resistees + t.sansIssue} ({Math.round((t.resistees / (t.resistees + t.sansIssue)) * 100)} %)
                </Text>
              ))
            )}
          </Carte>

          <Carte titre="12. Effet de tes parades">
            {s.parades.length === 0 ? (
              <Text style={styles.aide}>Choisis une parade dans Progrès pour mesurer son effet.</Text>
            ) : (
              s.parades.map((p) => (
                <Text key={p.libelle} style={styles.texte}>
                  {p.libelle} (« {p.parade} », depuis le {jj(p.depuis)}/{p.depuis.slice(5, 7)}) : {p.avant === null ? '—' : virgule(Math.round(p.avant * 10) / 10)} →{' '}
                  {p.apres === null ? 'à mesurer' : virgule(Math.round(p.apres * 10) / 10)} par jour
                </Text>
              ))
            )}
          </Carte>

          <Carte titre="13. Café → cigarette">
            <Text style={styles.texte}>
              {tdb.cafeine.totalSept === 0
                ? 'Note tes cafés (☕) pour voir le lien.'
                : `${tdb.cafeine.suiviesDeCigarette} café${tdb.cafeine.suiviesDeCigarette > 1 ? 's' : ''} sur ${tdb.cafeine.totalSept} suivis d’une cigarette dans les 20 min (7 jours)`}
            </Text>
          </Carte>

          <Carte titre="14. Bilans et cigarettes">
            {s.bilans.length === 0 ? (
              <Text style={styles.aide}>Saisis un bilan dans Santé.</Text>
            ) : (
              s.bilans.map((b) => (
                <Text key={b.date} style={styles.texte}>
                  {jj(b.date)}/{b.date.slice(5, 7)} : {b.cigarettesParJour === null ? 'cigarettes non notées' : `${virgule(Math.round(b.cigarettesParJour * 10) / 10)} cig./jour avant`}
                  {b.ldl !== undefined ? ` · LDL ${virgule(b.ldl)}` : ''}
                  {b.hdl !== undefined ? ` · HDL ${virgule(b.hdl)}` : ''}
                  {b.crp !== undefined ? ` · CRP ${virgule(b.crp)}` : ''}
                  {b.leucocytes !== undefined ? ` · leuco. ${virgule(b.leucocytes)}` : ''}
                </Text>
              ))
            )}
          </Carte>

          <Text style={styles.aide}>Avec ou sans patch, records, économies et bilan de la semaine : dans Progrès.</Text>
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
  texte: { color: couleurs.encre, fontSize: 15, lineHeight: 21 },
  aide: { color: couleurs.doux, fontSize: 14, lineHeight: 19 },
  barres: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 120 },
  colonne: { flex: 1, alignItems: 'center' },
  valeurBarre: { color: couleurs.doux, fontSize: 10, fontVariant: ['tabular-nums'] },
  zoneBarre: { height: 80, width: '100%', justifyContent: 'flex-end' },
  barre: { width: '100%', borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  jourBarre: { color: couleurs.doux, fontSize: 11, marginTop: 2 },
  heures: { flexDirection: 'row', alignItems: 'flex-end', gap: 1, height: 90 },
  colonneHeure: { flex: 1, alignItems: 'center' },
  zoneHeure: { height: 70, width: '100%', justifyContent: 'flex-end' },
  ligneContexte: { gap: 2, paddingVertical: 2 },
  jauge: { height: 8, borderRadius: 4, backgroundColor: couleurs.ligne, overflow: 'hidden' },
  jaugePleine: { height: 8, backgroundColor: couleurs.vert },
});

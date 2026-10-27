import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { AnalyseMontre, JourMontre } from '../domain';
import { couleurs, espace } from './theme';

/**
 * Montre et capteurs (RM-27) : données lues dans Health Connect (Zepp, Dexcom, RENPHO…),
 * croisées avec les cigarettes. Rien n'est enregistré ni envoyé au coach IA.
 */
export type EtatMontre = 'chargement' | 'indisponible' | 'a-connecter' | 'connecte';

interface Props {
  etat: EtatMontre;
  montre: AnalyseMontre | null;
  tz: string;
  onConnecter: () => void;
  onActualiser: () => void;
}

const hhmm = (t: number, tz: string) => new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: tz }).format(t);
const duree = (m: number) => (m < 60 ? `${Math.round(m)} min` : `${Math.floor(m / 60)} h ${String(Math.round(m % 60)).padStart(2, '0')}`);
const un = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');

function Serie({ titre, jours, valeur, format, sens }: { titre: string; jours: JourMontre[]; valeur: (j: JourMontre) => number | null; format: (n: number) => string; sens: 'bas' | 'haut' }) {
  const pts = jours.map((j) => ({ jour: j.jour, v: valeur(j) }));
  const vals = pts.map((p) => p.v).filter((x): x is number => x !== null);
  if (vals.length === 0) return null;
  const max = Math.max(...vals);
  const min = Math.min(...vals);
  const derniere = [...pts].reverse().find((p) => p.v !== null)!;
  return (
    <View style={styles.carte}>
      <View style={styles.ligneEntre}>
        <Text style={styles.petit}>{titre}</Text>
        <Text style={styles.valeur}>{format(derniere.v!)}</Text>
      </View>
      <View style={styles.barres}>
        {pts.map((p) => {
          const t = p.v === null || max === min ? 0.5 : (p.v - min) / (max - min);
          const bon = sens === 'bas' ? 1 - t : t;
          return (
            <View key={p.jour} style={styles.colonne}>
              <View style={styles.zone}>
                {p.v !== null && (
                  <View
                    style={[
                      styles.barre,
                      { height: `${Math.max(8, (p.v / (max || 1)) * 100)}%`, backgroundColor: bon > 0.66 ? couleurs.vert : bon > 0.33 ? couleurs.ambre : couleurs.rouge },
                    ]}
                  />
                )}
              </View>
              <Text style={styles.jour}>{p.jour.slice(8, 10)}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

export function OngletMontre({ etat, montre, tz, onConnecter, onActualiser }: Props) {
  if (etat === 'chargement') return <Text style={styles.aide}>Lecture de Health Connect…</Text>;
  if (etat === 'indisponible')
    return (
      <View style={styles.carte}>
        <Text style={styles.petit}>Montre et capteurs</Text>
        <Text style={styles.texte}>
          Cette version de l’app ne sait pas encore lire Health Connect : il faut installer le nouvel APK de Déclic (construit avec Health Connect).
        </Text>
      </View>
    );
  if (etat === 'a-connecter' || !montre)
    return (
      <View style={styles.carte}>
        <Text style={styles.petit}>Montre et capteurs</Text>
        <Text style={styles.texte}>
          Déclic peut lire, sans rien modifier, le sommeil, le cœur, l’HRV, les pas, la SpO2 (montre Zepp), la glycémie (Dexcom), la tension et le poids
          (RENPHO), pour les croiser avec tes cigarettes.
        </Text>
        <Pressable style={styles.bouton} onPress={onConnecter} accessibilityRole="button">
          <Text style={styles.boutonTexte}>Autoriser la lecture (Health Connect)</Text>
        </Pressable>
        <Text style={styles.aide}>Les données restent sur ton téléphone et ne sont jamais envoyées au coach IA.</Text>
      </View>
    );

  const j = montre.jours;
  const aujourdhui = j.at(-1)!;
  const delais = j.map((x) => x.delaiPremiereMinutes).filter((x): x is number => x !== null);
  const glu = aujourdhui.glucose ?? [...j].reverse().find((x) => x.glucose)?.glucose ?? null;
  return (
    <>
      <View style={styles.carte}>
        <View style={styles.ligneEntre}>
          <Text style={styles.petit}>Ce matin</Text>
          <Pressable onPress={onActualiser} accessibilityRole="button" hitSlop={8}>
            <Text style={styles.lien}>Actualiser</Text>
          </Pressable>
        </View>
        {aujourdhui.reveil ? (
          <Text style={styles.texte}>
            Réveil à {hhmm(aujourdhui.reveil, tz)} · sommeil {duree(aujourdhui.sommeilMinutes ?? 0)}
            {aujourdhui.delaiPremiereMinutes !== null ? ` · première cigarette ${duree(aujourdhui.delaiPremiereMinutes)} après le réveil` : ''}
          </Text>
        ) : (
          <Text style={styles.aide}>Pas encore de sommeil synchronisé pour cette nuit (ouvre Zepp pour synchroniser).</Text>
        )}
        {delais.length > 1 && (
          <Text style={styles.aide}>
            Réveil → première cigarette, moyenne sur {delais.length} jours : {duree(delais.reduce((s, x) => s + x, 0) / delais.length)}
          </Text>
        )}
        <Text style={styles.aide}>Sources lues : {montre.sources.length ? montre.sources.join(', ') : 'aucune donnée pour l’instant'}</Text>
      </View>

      {montre.effetCigarette && (
        <View style={styles.carte}>
          <Text style={styles.petit}>Une cigarette et ton cœur</Text>
          <Text style={styles.texte}>
            {un(montre.effetCigarette.avant)} bpm dans les 30 min avant → {un(montre.effetCigarette.apres)} bpm dans les 30 min après (
            {montre.effetCigarette.apres >= montre.effetCigarette.avant ? '+' : ''}
            {un(montre.effetCigarette.apres - montre.effetCigarette.avant)} bpm, sur {montre.effetCigarette.cigarettes} cigarette
            {montre.effetCigarette.cigarettes > 1 ? 's' : ''})
          </Text>
          <Text style={styles.aide}>La nicotine accélère le cœur. Mesure indicative : l’activité du moment compte aussi.</Text>
        </View>
      )}

      <Serie titre="Délai réveil → 1re cigarette" jours={j} valeur={(x) => x.delaiPremiereMinutes} format={duree} sens="haut" />
      <Serie titre="Sommeil" jours={j} valeur={(x) => x.sommeilMinutes} format={duree} sens="haut" />
      <Serie titre="Fréquence cardiaque au repos" jours={j} valeur={(x) => x.frequenceRepos} format={(n) => `${Math.round(n)} bpm`} sens="bas" />
      <Serie titre="HRV (variabilité, stress)" jours={j} valeur={(x) => x.hrvMs} format={(n) => `${Math.round(n)} ms`} sens="haut" />
      <Serie titre="Pas" jours={j} valeur={(x) => x.pas} format={(n) => String(Math.round(n))} sens="haut" />
      <Serie titre="SpO2" jours={j} valeur={(x) => x.spo2} format={(n) => `${Math.round(n)} %`} sens="haut" />
      <Serie titre="Glycémie moyenne" jours={j} valeur={(x) => x.glucose?.moyenne ?? null} format={(n) => `${Math.round(n)} mg/dL`} sens="bas" />
      {glu && (
        <Text style={styles.aide}>
          Glycémie du jour : {Math.round(glu.min)} à {Math.round(glu.max)} mg/dL (moyenne {Math.round(glu.moyenne)}).
        </Text>
      )}
      {(montre.derniereTension || montre.dernierPoids) && (
        <View style={styles.carte}>
          <Text style={styles.petit}>Dernières mesures</Text>
          {montre.derniereTension && (
            <Text style={styles.texte}>
              Tension : {Math.round(montre.derniereTension.sys)}/{Math.round(montre.derniereTension.dia)} mmHg
            </Text>
          )}
          {montre.dernierPoids && <Text style={styles.texte}>Poids : {un(montre.dernierPoids.kg)} kg</Text>}
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  carte: { backgroundColor: couleurs.carte, borderRadius: 18, borderWidth: 1, borderColor: couleurs.ligne, padding: espace(4), gap: espace(2) },
  petit: { color: couleurs.doux, fontSize: 15, fontWeight: '700', textTransform: 'uppercase', flexShrink: 1 },
  texte: { color: couleurs.encre, fontSize: 15, lineHeight: 21 },
  aide: { color: couleurs.doux, fontSize: 14, lineHeight: 19 },
  lien: { color: couleurs.vert, fontSize: 15, fontWeight: '700' },
  valeur: { color: couleurs.encre, fontSize: 18, fontWeight: '800', fontVariant: ['tabular-nums'] },
  ligneEntre: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: espace(2) },
  bouton: { backgroundColor: couleurs.vert, borderRadius: 16, paddingVertical: espace(3), alignItems: 'center' },
  boutonTexte: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  barres: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 70 },
  colonne: { flex: 1, alignItems: 'center' },
  zone: { height: 52, width: '100%', justifyContent: 'flex-end' },
  barre: { width: '100%', borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  jour: { color: couleurs.doux, fontSize: 10, marginTop: 2 },
});

import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { pistesSommeil, semainesReparateur, type AnalyseMontre, type JourMontre } from '../domain';
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

/**
 * Couleur d'une barre : par rapport à TA moyenne (écart de moins de 5 % = vert), ou par seuils
 * absolus quand ils existent (SpO2). Une petite variation n'est jamais rouge.
 */
function couleurBarre(v: number, moyenne: number, sens: 'bas' | 'haut', seuils?: { vert: number; ambre: number }): string {
  if (seuils) return v >= seuils.vert ? couleurs.vert : v >= seuils.ambre ? couleurs.ambre : couleurs.rouge;
  const ecart = ((v - moyenne) / (moyenne || 1)) * (sens === 'haut' ? 1 : -1);
  return ecart >= -0.05 ? couleurs.vert : ecart >= -0.15 ? couleurs.ambre : couleurs.rouge;
}

function Serie({
  titre,
  jours,
  valeur,
  format,
  sens,
  seuils,
}: {
  titre: string;
  jours: JourMontre[];
  valeur: (j: JourMontre) => number | null;
  format: (n: number) => string;
  sens: 'bas' | 'haut';
  seuils?: { vert: number; ambre: number };
}) {
  const pts = jours.map((j) => ({ jour: j.jour, v: valeur(j) }));
  const vals = pts.map((p) => p.v).filter((x): x is number => x !== null);
  if (vals.length === 0) return null;
  const max = Math.max(...vals);
  const moyenne = vals.reduce((s, x) => s + x, 0) / vals.length;
  const derniere = [...pts].reverse().find((p) => p.v !== null)!;
  return (
    <View style={styles.carte}>
      <View style={styles.ligneEntre}>
        <Text style={styles.petit}>{titre}</Text>
        <Text style={styles.valeur}>{format(derniere.v!)}</Text>
      </View>
      <View style={styles.barres}>
        {pts.map((p) => {
          return (
            <View key={p.jour} style={styles.colonne}>
              <View style={styles.zone}>
                {p.v !== null && (
                  <View
                    style={[
                      styles.barre,
                      { height: `${Math.max(8, (p.v / (max || 1)) * 100)}%`, backgroundColor: couleurBarre(p.v, moyenne, sens, seuils) },
                    ]}
                  />
                )}
              </View>
              <Text style={styles.jour}>{p.jour.slice(8, 10)}</Text>
            </View>
          );
        })}
      </View>
      <Text style={styles.aide}>
        moy. 14 j : {format(moyenne)}
      </Text>
    </View>
  );
}


const VERDICTS = {
  bien: { mot: 'Bien', couleur: couleurs.vert, fond: couleurs.vertClair },
  limite: { mot: 'Limite', couleur: couleurs.ambre, fond: couleurs.ambreClair },
  ameliorer: { mot: 'À améliorer', couleur: couleurs.rouge, fond: couleurs.rougeClair },
} as const;

/** Sommeil réparateur d'un coup d'œil : la semaine en vert / orange / rouge, puis les pistes si besoin. */
function CarteSommeil({ jours, tz }: { jours: JourMontre[]; tz: string }) {
  const [ouvert, setOuvert] = useState(false);
  const semaines = semainesReparateur(jours).slice(-4);
  const pistes = pistesSommeil(jours.slice(-14), tz);
  const cette = semaines.at(-1);
  if (!cette) return null;
  const v = VERDICTS[cette.verdict];
  return (
    <View style={styles.carte}>
      <Text style={styles.petit}>Sommeil réparateur · cette semaine</Text>
      <View style={[styles.verdict, { backgroundColor: v.fond }]}>
        <Text style={[styles.verdictValeur, { color: v.couleur }]}>{Math.round(cette.pct)} %</Text>
        <View style={styles.flex}>
          <Text style={[styles.verdictMot, { color: v.couleur }]}>{v.mot}</Text>
          <Text style={styles.aide}>{duree(cette.minutes)} par nuit · repère ≥ 35 %</Text>
        </View>
      </View>
      {semaines.length > 1 && (
        <View style={styles.semaines}>
          {semaines.map((w) => (
            <View key={w.lundi} style={[styles.semaine, { backgroundColor: VERDICTS[w.verdict].fond }]}>
              <Text style={[styles.semaineValeur, { color: VERDICTS[w.verdict].couleur }]}>{Math.round(w.pct)} %</Text>
              <Text style={styles.jour}>
                sem. {w.lundi.slice(8, 10)}/{w.lundi.slice(5, 7)}
              </Text>
            </View>
          ))}
        </View>
      )}
      {cette.verdict === 'bien' ? (
        <Text style={styles.mesure}>Rien à changer : continue comme ça.</Text>
      ) : pistes.length > 0 ? (
        <Pressable onPress={() => setOuvert(!ouvert)} accessibilityRole="button" hitSlop={6}>
          <Text style={styles.lien}>
            {ouvert ? '▾' : '▸'} {pistes.length} piste{pistes.length > 1 ? 's' : ''} pour l’améliorer
          </Text>
        </Pressable>
      ) : null}
      {ouvert &&
        pistes.map((p) => (
          <View key={p.titre} style={styles.piste}>
            <Text style={styles.titrePiste}>{p.titre}</Text>
            {p.mesure ? <Text style={styles.mesure}>{p.mesure}</Text> : <Text style={styles.aide}>{p.detail}</Text>}
          </View>
        ))}
    </View>
  );
}

export function OngletMontre({ etat, montre, tz, onConnecter, onActualiser }: Props) {
  // Instant de l'affichage (l'onglet est relu à chaque « Actualiser »).
  const [maintenant] = useState(() => Date.now());
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

  const j = montre.jours.slice(-14);
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
        ) : null}
        {aujourdhui.reveil && aujourdhui.premiere === null ? (
          <Text style={[styles.texte, styles.bravo]}>Sans cigarette depuis le réveil : {duree((maintenant - aujourdhui.reveil) / 60_000)}</Text>
        ) : null}
        {aujourdhui.premiereAvantReveil ? (
          <Text style={styles.aide}>Ta première cigarette est notée avant la fin du sommeil mesuré par la montre : le délai de ce matin n’est pas compté.</Text>
        ) : null}
        {aujourdhui.reveil ? null : (
          <Text style={styles.aide}>Pas encore de sommeil synchronisé pour cette nuit (ouvre Zepp pour synchroniser).</Text>
        )}
        {delais.length > 1 && (
          <Text style={styles.aide}>
            Réveil → première cigarette, moyenne sur {delais.length} jours : {duree(delais.reduce((s, x) => s + x, 0) / delais.length)}
          </Text>
        )}
        <Text style={styles.aide}>Sources lues : {montre.sources.length ? montre.sources.join(', ') : 'aucune donnée pour l’instant'}</Text>
      </View>

      <CarteSommeil jours={montre.jours} tz={tz} />

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
      <Serie titre="Sommeil réparateur (profond + paradoxal)" jours={j} valeur={(x) => x.reparateurMinutes} format={duree} sens="haut" />
      <Serie titre="Fréquence cardiaque au repos" jours={j} valeur={(x) => x.frequenceRepos} format={(n) => `${Math.round(n)} bpm`} sens="bas" />
      <Serie titre="HRV (variabilité, stress)" jours={j} valeur={(x) => x.hrvMs} format={(n) => `${Math.round(n)} ms`} sens="haut" />
      <Serie titre="Pas" jours={j} valeur={(x) => x.pas} format={(n) => String(Math.round(n))} sens="haut" />
      <Serie titre="SpO2" jours={j} valeur={(x) => x.spo2} format={(n) => `${Math.round(n)} %`} sens="haut" seuils={{ vert: 95, ambre: 92 }} />
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
  flex: { flex: 1 },
  verdict: { flexDirection: 'row', alignItems: 'center', gap: espace(3), borderRadius: 14, padding: espace(3) },
  verdictValeur: { fontSize: 34, fontWeight: '900', fontVariant: ['tabular-nums'] },
  verdictMot: { fontSize: 20, fontWeight: '800' },
  semaines: { flexDirection: 'row', gap: espace(2) },
  semaine: { flex: 1, borderRadius: 10, paddingVertical: espace(2), alignItems: 'center' },
  semaineValeur: { fontSize: 17, fontWeight: '800' },
  piste: { gap: 2, paddingTop: espace(1), borderTopWidth: 1, borderTopColor: couleurs.ligne },
  titrePiste: { color: couleurs.encre, fontSize: 16, fontWeight: '700' },
  mesure: { color: couleurs.vert, fontSize: 14, fontWeight: '700' },
  bravo: { color: couleurs.vert, fontWeight: '800' },
  ligneEntre: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: espace(2) },
  bouton: { backgroundColor: couleurs.vert, borderRadius: 16, paddingVertical: espace(3), alignItems: 'center' },
  boutonTexte: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  barres: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 70 },
  colonne: { flex: 1, alignItems: 'center' },
  zone: { height: 52, width: '100%', justifyContent: 'flex-end' },
  barre: { width: '100%', borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  jour: { color: couleurs.doux, fontSize: 10, marginTop: 2 },
});

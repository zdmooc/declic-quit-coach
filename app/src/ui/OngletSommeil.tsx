import { StyleSheet, Text, View } from 'react-native';
import { heuresReveils, reveilsSelonCigarette, semainesReveils, type AnalyseMontre, type JourMontre, type PhaseSommeil } from '../domain';
import { CarteSommeil, duree, hhmm, OngletMontre, Serie, styles as s, VERDICTS, type EtatMontre } from './OngletMontre';
import { couleurs, espace } from './theme';

/**
 * Sommeil (RM-28, RM-31) : réveils nocturnes d'un coup d'œil, graphes (réveils par nuit, dernière
 * nuit en bandeau, heures des réveils), puis sommeil réparateur et pistes. Données Health Connect.
 */
interface Props {
  etat: EtatMontre;
  montre: AnalyseMontre | null;
  tz: string;
  onConnecter: () => void;
  onActualiser: () => void;
}

const COULEURS_PHASES: Record<PhaseSommeil, string> = { profond: '#1F4D38', paradoxal: '#4E9A72', leger: '#A9D3BC', eveil: '#D9A441' };
const un = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');

/** Réveils par nuit (14 nuits) : hauteur = nombre de réveils, couleur = temps éveillé, point rouge = cigarette dans la nuit. */
function ReveilsParNuit({ jours }: { jours: JourMontre[] }) {
  const max = Math.max(1, ...jours.map((j) => j.reveils?.length ?? 0));
  return (
    <View style={s.carte}>
      <Text style={s.petit}>Réveils par nuit</Text>
      <View style={st.barres}>
        {jours.map((j) => {
          const n = j.reveils?.length ?? null;
          const v = j.eveilMinutes === null ? null : VERDICTS[j.eveilMinutes < 30 ? 'bien' : j.eveilMinutes <= 60 ? 'limite' : 'ameliorer'];
          return (
            <View key={j.jour} style={st.colonne}>
              <Text style={st.valeur}>{n ?? ''}</Text>
              <View style={st.zone}>
                {n !== null && <View style={[st.barre, { height: `${Math.max(6, (n / max) * 100)}%`, backgroundColor: v?.couleur ?? couleurs.ligne }]} />}
              </View>
              <View style={[st.point, j.cigarettesNuit > 0 && st.pointRouge]} />
              <Text style={st.jour}>{j.jour.slice(8, 10)}</Text>
            </View>
          );
        })}
      </View>
      <Text style={s.aide}>Couleur : temps éveillé (vert &lt; 30 min, orange 30 à 60, rouge &gt; 60). ● rouge : cigarette fumée dans la nuit.</Text>
    </View>
  );
}

/** Dernière nuit en bandeau : du coucher au réveil, phases en couleurs, réveils en orange. */
function DerniereNuit({ nuit, tz }: { nuit: JourMontre; tz: string }) {
  const seg = nuit.segments!;
  const debut = seg[0]!.debut;
  const fin = seg.at(-1)!.fin;
  const total = fin - debut || 1;
  return (
    <View style={s.carte}>
      <Text style={s.petit}>
        Nuit du {nuit.jour.slice(8, 10)}/{nuit.jour.slice(5, 7)}
      </Text>
      <View style={st.bandeau}>
        {seg.map((x) => (
          <View key={x.debut} style={{ flex: (x.fin - x.debut) / total, backgroundColor: COULEURS_PHASES[x.phase] }} />
        ))}
      </View>
      <View style={s.ligneEntre}>
        <Text style={s.aide}>{hhmm(debut, tz)}</Text>
        <Text style={s.aide}>{hhmm(fin, tz)}</Text>
      </View>
      <Text style={s.texte}>
        {nuit.reveils!.length} réveil{nuit.reveils!.length > 1 ? 's' : ''}
        {nuit.reveils!.length > 0 ? ` (${nuit.reveils!.map((r) => hhmm(r.debut, tz)).join(', ')})` : ''} · {duree(nuit.eveilMinutes ?? 0)} éveillé
        {nuit.cigarettesNuit > 0 ? ` · ${nuit.cigarettesNuit} cigarette${nuit.cigarettesNuit > 1 ? 's' : ''} dans la nuit` : ''}
      </Text>
      <Text style={s.aide}>■ profond ■ paradoxal ■ léger ■ éveillé (du plus foncé au orange)</Text>
    </View>
  );
}

/** Heures des réveils sur 4 semaines (22 h à 7 h). */
function HeuresReveils({ jours, tz }: { jours: JourMontre[]; tz: string }) {
  const h = heuresReveils(jours, tz);
  const max = Math.max(1, ...h.map((x) => x.nombre));
  if (h.every((x) => x.nombre === 0)) return null;
  const pic = h.reduce((a, b) => (b.nombre > a.nombre ? b : a));
  return (
    <View style={s.carte}>
      <Text style={s.petit}>Heures des réveils · 4 semaines</Text>
      <View style={st.barres}>
        {h.map((x) => (
          <View key={x.heure} style={st.colonne}>
            <Text style={st.valeur}>{x.nombre || ''}</Text>
            <View style={st.zone}>
              {x.nombre > 0 && <View style={[st.barre, { height: `${(x.nombre / max) * 100}%`, backgroundColor: x === pic ? couleurs.ambre : couleurs.vert }]} />}
            </View>
            <Text style={st.jour}>{x.heure} h</Text>
          </View>
        ))}
      </View>
      <Text style={s.aide}>Tu te réveilles le plus souvent vers {pic.heure} h.</Text>
    </View>
  );
}

export function OngletSommeil(props: Props) {
  const { montre, tz } = props;
  if (props.etat !== 'connecte' || !montre) return <OngletMontre {...props} />;
  const jours = montre.jours;
  const quatorze = jours.slice(-14);
  const semaines = semainesReveils(jours).slice(-4);
  const cette = semaines.at(-1);
  const derniere = [...jours].reverse().find((j) => j.segments && j.reveils);
  const selon = reveilsSelonCigarette(jours);
  const detail = jours.some((j) => j.reveils !== null);
  return (
    <>
      {cette ? (
        <View style={s.carte}>
          <Text style={s.petit}>Réveils nocturnes · cette semaine</Text>
          <View style={[s.verdict, { backgroundColor: VERDICTS[cette.verdict].fond }]}>
            <Text style={[s.verdictValeur, { color: VERDICTS[cette.verdict].couleur }]}>{cette.reveils === null ? '—' : un(cette.reveils)}</Text>
            <View style={s.flex}>
              <Text style={[s.verdictMot, { color: VERDICTS[cette.verdict].couleur }]}>{VERDICTS[cette.verdict].mot}</Text>
              <Text style={s.aide}>réveils / nuit · {duree(cette.eveilMinutes)} éveillé</Text>
            </View>
          </View>
          {semaines.length > 1 && (
            <View style={s.semaines}>
              {semaines.map((w) => (
                <View key={w.lundi} style={[s.semaine, { backgroundColor: VERDICTS[w.verdict].fond }]}>
                  <Text style={[s.semaineValeur, { color: VERDICTS[w.verdict].couleur }]}>{w.reveils === null ? duree(w.eveilMinutes) : un(w.reveils)}</Text>
                  <Text style={s.jour}>
                    sem. {w.lundi.slice(8, 10)}/{w.lundi.slice(5, 7)}
                  </Text>
                </View>
              ))}
            </View>
          )}
          {selon && (
            <Text style={s.mesure}>
              {un(selon.pres)} réveils quand la dernière cigarette est à moins de 1 h 30 du coucher, {un(selon.loin)} sinon.
            </Text>
          )}
          {!detail && <Text style={s.aide}>La montre ne transmet pas le détail des réveils : seul le temps éveillé total est compté.</Text>}
        </View>
      ) : (
        <View style={s.carte}>
          <Text style={s.petit}>Réveils nocturnes</Text>
          <Text style={s.aide}>Pas encore de nuit synchronisée (ouvre Zepp pour synchroniser, puis Actualiser).</Text>
        </View>
      )}
      <ReveilsParNuit jours={quatorze} />
      {derniere && <DerniereNuit nuit={derniere} tz={tz} />}
      <HeuresReveils jours={jours} tz={tz} />
      <CarteSommeil jours={jours} tz={tz} />
      <Serie titre="Sommeil" jours={quatorze} valeur={(x) => x.sommeilMinutes} format={duree} sens="haut" />
      <Serie titre="Sommeil réparateur (profond + paradoxal)" jours={quatorze} valeur={(x) => x.reparateurMinutes} format={duree} sens="haut" />
    </>
  );
}

const st = StyleSheet.create({
  barres: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 104 },
  colonne: { flex: 1, alignItems: 'center' },
  valeur: { color: couleurs.doux, fontSize: 11, fontVariant: ['tabular-nums'] },
  zone: { height: 64, width: '100%', justifyContent: 'flex-end' },
  barre: { width: '100%', borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  point: { width: 6, height: 6, borderRadius: 3, marginTop: 2, backgroundColor: 'transparent' },
  pointRouge: { backgroundColor: couleurs.rouge },
  jour: { color: couleurs.doux, fontSize: 10, marginTop: 1 },
  bandeau: { flexDirection: 'row', height: 22, borderRadius: 6, overflow: 'hidden', backgroundColor: couleurs.ligne, marginTop: espace(1) },
});

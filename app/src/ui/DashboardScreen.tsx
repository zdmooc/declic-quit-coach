import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { formatDuree, formatEuros, type TableauDeBord } from '../domain';
import { couleurs, espace } from './theme';

interface Props {
  tdb: TableauDeBord;
  tz: string;
  onFume: () => void;
  onResiste: () => void;
  onAnnuler: () => void;
  onPalier: () => void;
}

const heure = (t: number, tz: string) =>
  new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: tz }).format(t);

const dateLongue = (jour: string) =>
  new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(Date.parse(`${jour}T12:00:00Z`));

function Prochaine({ tdb, tz }: { tdb: TableauDeBord; tz: string }) {
  const p = tdb.prochaine;
  if (p.statut === 'arret') {
    const depuis = tdb.depuisDerniereMinutes;
    return (
      <>
        <Text style={styles.grand}>Journée sans tabac</Text>
        <Text style={styles.sous}>{depuis === null ? 'Aucune cigarette depuis le début.' : `${formatDuree(depuis)} sans fumer.`}</Text>
      </>
    );
  }
  if (p.statut === 'quota-atteint') {
    return (
      <>
        <Text style={styles.grand}>Quota du jour atteint</Text>
        <Text style={styles.sous}>Le bouton « J’ai résisté » est là si une envie arrive.</Text>
      </>
    );
  }
  if (p.statut === 'attendre') {
    return (
      <>
        <Text style={styles.petit}>Prochaine cigarette possible dans</Text>
        <Text style={styles.compteur}>{formatDuree(p.resteMinutes)}</Text>
        <Text style={styles.sous}>à {heure(p.a, tz)}</Text>
      </>
    );
  }
  return (
    <>
      <Text style={styles.grand}>Tu peux fumer ta prochaine</Text>
      <Text style={styles.sous}>Ou tenter 10 minutes de plus : chaque minute compte.</Text>
    </>
  );
}

export function DashboardScreen({ tdb, tz, onFume, onResiste, onAnnuler, onPalier }: Props) {
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Text style={styles.marque}>Déclic</Text>
      <Text style={styles.titre}>
        {tdb.phase === 'avant-debut' ? 'Ton plan commence bientôt' : `Jour ${tdb.jourDuPlan + 1} du plan`}
      </Text>
      {tdb.dateDuZero && tdb.phase === 'reduction' && (
        <Text style={styles.texte}>Zéro cigarette prévu le {dateLongue(tdb.dateDuZero)}.</Text>
      )}

      {tdb.proposerPalier && (
        <View style={styles.bandeau}>
          <Text style={styles.bandeauTexte}>
            Hier a été difficile. On garde le même quota aujourd’hui pour consolider ?
          </Text>
          <Pressable onPress={onPalier} accessibilityRole="button">
            <Text style={styles.bandeauAction}>Garder le même quota</Text>
          </Pressable>
        </View>
      )}

      <View style={[styles.carte, styles.carteHero]}>
        <Prochaine tdb={tdb} tz={tz} />
      </View>

      <View style={styles.ligne}>
        <View style={[styles.carte, styles.demi]}>
          <Text style={styles.petit}>Aujourd’hui</Text>
          <Text style={styles.valeur}>
            {tdb.fumees} / {tdb.quota}
          </Text>
          <Text style={styles.sous}>
            {tdb.intervalleCibleMinutes ? `objectif : 1 toutes les ${formatDuree(tdb.intervalleCibleMinutes)}` : 'objectif zéro'}
            {tdb.intervalleMoyenMinutes !== null ? `\nen réalité : 1 toutes les ${formatDuree(tdb.intervalleMoyenMinutes)}` : ''}
          </Text>
        </View>
        <View style={[styles.carte, styles.demi]}>
          <Text style={styles.petit}>Envies résistées</Text>
          <Text style={styles.valeur}>{tdb.enviesResistees}</Text>
          <Text style={styles.sous}>
            aujourd’hui
          </Text>
        </View>
      </View>

      <View style={styles.carte}>
        <Text style={styles.petit}>Économisé</Text>
        <Text style={styles.valeur}>{formatEuros(tdb.economieTotaleCents)}</Text>
        <Text style={styles.sous}>
          dont {formatEuros(tdb.economieJourCents)} aujourd’hui · {formatEuros(tdb.projection.parAnCents)} par an après l’arrêt
        </Text>
      </View>

      <Pressable style={styles.bouton} onPress={onFume} accessibilityRole="button">
        <Text style={styles.boutonTexte}>J’ai fumé</Text>
      </Pressable>
      <Pressable style={[styles.bouton, styles.boutonSecondaire]} onPress={onResiste} accessibilityRole="button">
        <Text style={[styles.boutonTexte, styles.boutonTexteSecondaire]}>J’ai résisté à une envie</Text>
      </Pressable>
      <Pressable onPress={onAnnuler} accessibilityRole="button" style={styles.lien}>
        <Text style={styles.lienTexte}>Annuler la dernière saisie</Text>
      </Pressable>

      <Text style={styles.mention}>
        Besoin d’aide ? Tabac Info Service : 39 89. Déclic ne remplace pas un avis médical.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: espace(6), paddingTop: espace(16), backgroundColor: couleurs.fond, flexGrow: 1 },
  marque: { color: couleurs.vert, fontSize: 14, fontWeight: '700', letterSpacing: 2, textTransform: 'uppercase' },
  titre: { color: couleurs.encre, fontSize: 28, fontWeight: '700', marginTop: espace(2) },
  texte: { color: couleurs.doux, fontSize: 15, marginTop: espace(1) },
  carte: {
    backgroundColor: couleurs.carte,
    borderRadius: 18,
    padding: espace(5),
    marginTop: espace(4),
    borderWidth: 1,
    borderColor: couleurs.ligne,
  },
  carteHero: { backgroundColor: couleurs.vertClair, borderColor: couleurs.vertClair, alignItems: 'center', paddingVertical: espace(8) },
  ligne: { flexDirection: 'row', gap: espace(3) },
  demi: { flex: 1 },
  petit: { color: couleurs.doux, fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  compteur: { color: couleurs.vert, fontSize: 52, fontWeight: '800', marginVertical: espace(1), fontVariant: ['tabular-nums'] },
  grand: { color: couleurs.encre, fontSize: 24, fontWeight: '700', textAlign: 'center' },
  valeur: { color: couleurs.encre, fontSize: 30, fontWeight: '800', marginTop: espace(1), fontVariant: ['tabular-nums'] },
  sous: { color: couleurs.doux, fontSize: 14, marginTop: espace(1), textAlign: 'center' },
  bandeau: { backgroundColor: couleurs.ambreClair, borderRadius: 14, padding: espace(4), marginTop: espace(4) },
  bandeauTexte: { color: couleurs.encre, fontSize: 15, lineHeight: 21 },
  bandeauAction: { color: couleurs.ambre, fontWeight: '700', marginTop: espace(2), fontSize: 15 },
  bouton: { backgroundColor: couleurs.vert, borderRadius: 16, paddingVertical: espace(5), alignItems: 'center', marginTop: espace(6) },
  boutonSecondaire: { backgroundColor: couleurs.carte, borderWidth: 2, borderColor: couleurs.vert, marginTop: espace(3) },
  boutonTexte: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  boutonTexteSecondaire: { color: couleurs.vert },
  lien: { alignItems: 'center', paddingVertical: espace(4) },
  lienTexte: { color: couleurs.doux, textDecorationLine: 'underline', fontSize: 14 },
  mention: { color: couleurs.doux, fontSize: 13, textAlign: 'center', marginTop: espace(2), marginBottom: espace(8) },
});

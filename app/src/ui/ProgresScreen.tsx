import { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { addDays, formatEuros, type MessageCoach, type PointCourbe, type Progres, type TableauDeBord } from '../domain';
import { couleurs, espace } from './theme';

/**
 * Progrès : mot du coach (F7.3 / F7.4), économies projetées et objectifs (F5.3, F5.4),
 * records (F5.6), bilan de la semaine (F6.7) et courbe du plan (F2.4).
 */
interface Props {
  tdb: TableauDeBord;
  progres: Progres;
  mot: MessageCoach | null;
  coachIa: boolean;
  onFermer: () => void;
  onParlerCoach: () => void;
  onAjouterObjectif: (libelle: string, montantCents: number) => void;
  onRetirerObjectif: (libelle: string) => void;
}

const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const dateCourte = (jour: string) => {
  const [, m, j] = jour.split('-').map(Number);
  return `${j} ${MOIS[(m ?? 1) - 1]}`;
};
const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`;

function Chiffre({ valeur, libelle }: { valeur: string; libelle: string }) {
  return (
    <View style={styles.chiffre}>
      <Text style={styles.chiffreValeur} numberOfLines={1} adjustsFontSizeToFit>
        {valeur}
      </Text>
      <Text style={styles.chiffreLibelle}>{libelle}</Text>
    </View>
  );
}

function Courbe({ points }: { points: PointCourbe[] }) {
  const max = Math.max(1, ...points.map((p) => Math.max(p.quota, p.fumees ?? 0)));
  return (
    <View>
      <View style={styles.courbe} accessibilityLabel={`Courbe du plan sur ${points.length} jours`}>
        {points.map((p) => {
          const depasse = p.fumees !== null && p.fumees > p.quota;
          return (
            <View key={p.jour} style={styles.colonne}>
              <View style={[styles.barreQuota, { height: `${(p.quota / max) * 100}%` }]} />
              {p.fumees !== null && (
                <View
                  style={[
                    styles.barreFumees,
                    depasse && styles.barreDepasse,
                    { height: `${(Math.max(p.fumees, 0.15) / max) * 100}%` },
                  ]}
                />
              )}
            </View>
          );
        })}
      </View>
      <View style={styles.legende}>
        <Text style={styles.aide}>
          <Text style={{ color: couleurs.vert }}>■</Text> fumées · <Text style={{ color: couleurs.ligne }}>■</Text> quota ·{' '}
          <Text style={{ color: couleurs.rouge }}>■</Text> au-dessus
        </Text>
      </View>
    </View>
  );
}

function Objectifs({ tdb, onAjouterObjectif, onRetirerObjectif }: Props) {
  const [libelle, setLibelle] = useState('');
  const [montant, setMontant] = useState('');
  const cents = Math.round(Number(montant.replace(',', '.')) * 100);
  const valide = libelle.trim().length > 0 && libelle.trim().length <= 40 && Number.isFinite(cents) && cents > 0;
  const aujourdhui = tdb.jour;

  return (
    <View style={styles.carte}>
      <Text style={styles.petit}>Objectifs d’épargne</Text>
      {tdb.objectifs.length === 0 && <Text style={styles.aide}>Donne un but à l’argent économisé : un vélo, un voyage, un cadeau.</Text>}
      {tdb.objectifs.map((o) => {
        const part = Math.min(1, tdb.economieTotaleCents / o.montantCents);
        const quand =
          o.joursRestants === 0
            ? 'Atteint, bravo !'
            : o.joursRestants === null
              ? tdb.phase === 'observation'
                ? 'Date estimée dès le début du plan'
                : 'Date estimée dès les premières économies'
              : `Vers le ${dateCourte(addDays(aujourdhui, o.joursRestants))} (${pluriel(o.joursRestants, 'jour')})`;
        return (
          <View key={o.libelle} style={styles.objectif}>
            <View style={styles.ligne}>
              <Text style={[styles.objectifNom, styles.flex]}>{o.libelle}</Text>
              <Text style={styles.objectifMontant}>{formatEuros(o.montantCents)}</Text>
            </View>
            <View style={styles.jauge}>
              <View style={[styles.jaugePleine, { width: `${part * 100}%` }]} />
            </View>
            <View style={styles.ligne}>
              <Text style={[styles.aide, styles.flex]}>{quand}</Text>
              <Pressable
                onPress={() =>
                  Alert.alert(`Retirer « ${o.libelle} » ?`, undefined, [
                    { text: 'Annuler', style: 'cancel' },
                    { text: 'Retirer', style: 'destructive', onPress: () => onRetirerObjectif(o.libelle) },
                  ])
                }
                hitSlop={8}
                accessibilityRole="button"
              >
                <Text style={styles.lienDoux}>Retirer</Text>
              </Pressable>
            </View>
          </View>
        );
      })}
      <View style={styles.ligne}>
        <TextInput style={[styles.champ, styles.flex]} value={libelle} onChangeText={setLibelle} placeholder="Ex. : vélo" maxLength={40} accessibilityLabel="Nom de l’objectif" />
        <TextInput style={[styles.champ, styles.montant]} value={montant} onChangeText={setMontant} placeholder="€" keyboardType="decimal-pad" accessibilityLabel="Montant en euros" />
      </View>
      <Pressable
        style={[styles.bouton, !valide && styles.inactif]}
        disabled={!valide}
        onPress={() => {
          onAjouterObjectif(libelle.trim(), cents);
          setLibelle('');
          setMontant('');
        }}
        accessibilityRole="button"
      >
        <Text style={styles.boutonTexte}>Ajouter l’objectif</Text>
      </Pressable>
    </View>
  );
}

export function ProgresScreen(props: Props) {
  const { tdb, progres: p, mot, coachIa, onFermer, onParlerCoach } = props;
  const b = p.bilanSemaine;
  const enPlan = tdb.phase !== 'observation';
  const tendance =
    b && b.moyenneSemainePrecedente !== null
      ? b.moyenneParJour < b.moyenneSemainePrecedente
        ? `en baisse par rapport à la semaine d’avant (${b.moyenneSemainePrecedente.toFixed(1).replace('.', ',')})`
        : b.moyenneParJour > b.moyenneSemainePrecedente
          ? `un peu plus que la semaine d’avant (${b.moyenneSemainePrecedente.toFixed(1).replace('.', ',')})`
          : 'stable par rapport à la semaine d’avant'
      : null;

  return (
    <Modal visible animationType="slide" onRequestClose={onFermer}>
      <SafeAreaView style={styles.page} edges={['top', 'bottom']}>
        <View style={styles.entete}>
          <Text style={styles.titre}>Progrès</Text>
          <Pressable onPress={onFermer} accessibilityRole="button" hitSlop={8}>
            <Text style={styles.fermer}>Fermer</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.contenu} keyboardShouldPersistTaps="handled">
          {mot && (
            <View style={[styles.carte, styles.carteCoach]}>
              <Text style={styles.petit}>Le mot du coach</Text>
              <Text style={styles.motTitre}>{mot.titre}</Text>
              <Text style={styles.motTexte}>{mot.texte}</Text>
              {coachIa && (
                <Pressable style={[styles.bouton, styles.boutonSecondaire]} onPress={onParlerCoach} accessibilityRole="button">
                  <Text style={[styles.boutonTexte, styles.boutonTexteSecondaire]}>En parler avec le coach</Text>
                </Pressable>
              )}
            </View>
          )}

          <View style={styles.carte}>
            <Text style={styles.petit}>Économies</Text>
            <View style={styles.grille}>
              <Chiffre valeur={formatEuros(tdb.economieTotaleCents)} libelle="économisés" />
              <Chiffre valeur={formatEuros(tdb.projection.parMoisCents)} libelle="par mois sans tabac" />
              <Chiffre valeur={formatEuros(tdb.projection.parAnCents)} libelle="par an sans tabac" />
            </View>
            {!enPlan && <Text style={styles.aide}>Les économies démarrent avec ton plan. Les projections partent de ta consommation actuelle.</Text>}
          </View>

          <Objectifs {...props} />

          <View style={styles.carte}>
            <Text style={styles.petit}>Records</Text>
            <View style={styles.grille}>
              <Chiffre valeur={String(p.records.joursSansTabac)} libelle="jours sans tabac" />
              <Chiffre valeur={formatDuree(tdb.plusLonguePauseMinutes)} libelle="plus longue pause" />
              <Chiffre valeur={p.records.meilleureJournee ? String(p.records.meilleureJournee.fumees) : '—'} libelle={p.records.meilleureJournee ? `meilleure journée (${dateCourte(p.records.meilleureJournee.jour)})` : 'meilleure journée'} />
              <Chiffre valeur={String(p.records.cigarettesEvitees)} libelle="cigarettes évitées" />
              <Chiffre valeur={String(p.records.serieQuotaTenu)} libelle="jours de suite au quota" />
            </View>
          </View>

          <View style={styles.carte}>
            <Text style={styles.petit}>Ta semaine</Text>
            {b ? (
              <>
                <Text style={styles.aide}>
                  Du {dateCourte(b.du)} au {dateCourte(b.au)} · {pluriel(b.jours, 'journée')} terminée{b.jours > 1 ? 's' : ''}
                </Text>
                <View style={styles.grille}>
                  <Chiffre valeur={b.moyenneParJour.toFixed(1).replace('.', ',')} libelle="cigarettes / jour" />
                  <Chiffre valeur={String(b.evitees)} libelle="évitées" />
                  <Chiffre valeur={formatEuros(b.economieCents)} libelle="économisés" />
                  <Chiffre valeur={String(b.enviesResistees)} libelle="envies résistées" />
                  <Chiffre valeur={String(b.intervallesTenus)} libelle="intervalles tenus" />
                  <Chiffre valeur={String(b.tropTot)} libelle="trop tôt" />
                </View>
                {tendance && <Text style={styles.aide}>Moyenne {tendance}.</Text>}
                {b.declencheur && <Text style={styles.aide}>Déclencheur le plus fréquent : {b.declencheur}.</Text>}
              </>
            ) : (
              <Text style={styles.aide}>Ton premier bilan arrive après ta première journée complète.</Text>
            )}
          </View>

          {p.courbe.length > 0 && (
            <View style={styles.carte}>
              <Text style={styles.petit}>Ton plan jusqu’à zéro</Text>
              {p.dateDuZero && <Text style={styles.motTitre}>Zéro cigarette le {dateCourte(p.dateDuZero)}</Text>}
              <Courbe points={p.courbe} />
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function formatDuree(m: number): string {
  if (m <= 0) return '—';
  const h = Math.floor(m / 60);
  const r = Math.round(m % 60);
  if (h === 0) return `${r} min`;
  if (h >= 48) return `${Math.floor(h / 24)} j`;
  return r === 0 ? `${h} h` : `${h} h ${String(r).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: couleurs.fond },
  entete: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: espace(4), paddingVertical: espace(3) },
  titre: { color: couleurs.encre, fontSize: 26, fontWeight: '800' },
  fermer: { color: couleurs.vert, fontSize: 16, fontWeight: '700' },
  contenu: { paddingHorizontal: espace(4), paddingBottom: espace(8), gap: espace(3) },
  carte: { backgroundColor: couleurs.carte, borderRadius: 18, borderWidth: 1, borderColor: couleurs.ligne, padding: espace(4), gap: espace(2) },
  carteCoach: { backgroundColor: couleurs.vertClair, borderColor: couleurs.vertClair },
  petit: { color: couleurs.doux, fontSize: 13, fontWeight: '700', textTransform: 'uppercase' },
  motTitre: { color: couleurs.vert, fontSize: 18, fontWeight: '800' },
  motTexte: { color: couleurs.encre, fontSize: 15, lineHeight: 22 },
  grille: { flexDirection: 'row', flexWrap: 'wrap', gap: espace(2) },
  chiffre: { width: '31%', flexGrow: 1, borderRadius: 14, borderWidth: 1, borderColor: couleurs.ligne, paddingVertical: espace(2), paddingHorizontal: espace(2), alignItems: 'center' },
  chiffreValeur: { color: couleurs.encre, fontSize: 18, fontWeight: '800', fontVariant: ['tabular-nums'] },
  chiffreLibelle: { color: couleurs.doux, fontSize: 12, textAlign: 'center' },
  aide: { color: couleurs.doux, fontSize: 13, lineHeight: 18 },
  ligne: { flexDirection: 'row', alignItems: 'center', gap: espace(2) },
  flex: { flex: 1 },
  objectif: { gap: espace(1), paddingVertical: espace(1) },
  objectifNom: { color: couleurs.encre, fontSize: 16, fontWeight: '700' },
  objectifMontant: { color: couleurs.encre, fontSize: 15, fontVariant: ['tabular-nums'] },
  jauge: { height: 8, borderRadius: 4, backgroundColor: couleurs.ligne, overflow: 'hidden' },
  jaugePleine: { height: 8, backgroundColor: couleurs.vert },
  lienDoux: { color: couleurs.doux, fontSize: 13, textDecorationLine: 'underline' },
  champ: { borderWidth: 1, borderColor: couleurs.ligne, borderRadius: 12, paddingHorizontal: espace(3), paddingVertical: espace(2), fontSize: 16, color: couleurs.encre, backgroundColor: couleurs.fond },
  montant: { width: 90 },
  bouton: { backgroundColor: couleurs.vert, borderRadius: 14, paddingVertical: espace(3), alignItems: 'center', marginTop: espace(1) },
  boutonSecondaire: { backgroundColor: couleurs.carte, borderWidth: 2, borderColor: couleurs.vert },
  boutonTexte: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  boutonTexteSecondaire: { color: couleurs.vert },
  inactif: { opacity: 0.4 },
  courbe: { height: 120, flexDirection: 'row', alignItems: 'flex-end', gap: 1, marginTop: espace(2) },
  colonne: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  barreQuota: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: couleurs.ligne, borderTopLeftRadius: 2, borderTopRightRadius: 2 },
  barreFumees: { position: 'absolute', bottom: 0, left: '20%', right: '20%', backgroundColor: couleurs.vert, borderTopLeftRadius: 2, borderTopRightRadius: 2 },
  barreDepasse: { backgroundColor: couleurs.rouge },
  legende: { marginTop: espace(1) },
});

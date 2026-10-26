import { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatDuree, type TableauDeBord, type TypeSubstitutOral } from '../domain';
import { couleurs, espace } from './theme';

/**
 * Substituts nicotiniques (F4, RM-08, RM-09, ADR-0004).
 * L'écran SUIT ce que l'utilisateur déclare : il ne propose ni ne calcule jamais de dose.
 * Les dosages listés sont ceux des produits du commerce, pour retrouver celui de sa boîte.
 */
interface Props {
  tdb: TableauDeBord;
  tz: string;
  maintenant: number;
  onFermer: () => void;
  /** `hhmm` : heure réelle si la pose est déclarée après coup (vide = maintenant). */
  onPoserPatch: (dosageMg: number, dureePortHeures: 16 | 24, hhmm?: string) => void;
  onRetirerPatch: (hhmm?: string) => void;
  onPrendre: (forme: TypeSubstitutOral, dosageMg: number) => void;
}

const DOSAGES_PATCH: Record<16 | 24, number[]> = { 24: [7, 14, 21], 16: [10, 15, 25] };
const DOSAGES_ORAUX: Record<TypeSubstitutOral, number[]> = { pastille: [1, 1.5, 2, 4], gomme: [2, 4] };
const NOMS: Record<TypeSubstitutOral, [string, string]> = { pastille: ['pastille', 'pastilles'], gomme: ['gomme', 'gommes'] };

const heure = (t: number, tz: string) => new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: tz }).format(t);
const mg = (n: number) => `${String(n).replace('.', ',')} mg`;

function Choix({ libelle, actif, onPress }: { libelle: string; actif: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.choix, actif && styles.choixActif]} onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: actif }}>
      <Text style={[styles.choixTexte, actif && styles.choixTexteActif]}>{libelle}</Text>
    </Pressable>
  );
}

/** Heure facultative « HH:MM » : vide = maintenant. */
function ChampHeure({ valeur, onChange, libelle }: { valeur: string; onChange: (v: string) => void; libelle: string }) {
  return (
    <View style={styles.ligneHeure}>
      <Text style={styles.libelleHeure}>{libelle}</Text>
      <TextInput
        style={styles.champHeure}
        value={valeur}
        onChangeText={onChange}
        placeholder="maintenant"
        placeholderTextColor={couleurs.doux}
        keyboardType="numbers-and-punctuation"
        maxLength={5}
        accessibilityLabel={`${libelle}, format 07:30, vide pour maintenant`}
      />
    </View>
  );
}

function CartePatch({ tdb, tz, onPoserPatch, onRetirerPatch }: Props) {
  const [duree, setDuree] = useState<16 | 24>(24);
  const [dosage, setDosage] = useState<number | null>(null);
  const [heurePose, setHeurePose] = useState('');
  const [heureRetrait, setHeureRetrait] = useState('');
  const p = tdb.patch;

  if (p.statut !== 'aucun') {
    const enRetard = p.statut === 'a-retirer';
    return (
      <View style={[styles.carte, enRetard && styles.carteAlerte]}>
        <Text style={styles.petit}>Patch</Text>
        <Text style={styles.grand}>{mg(p.dosageMg)}</Text>
        <Text style={styles.sous}>Posé à {heure(p.poseLe, tz)}</Text>
        <Text style={[styles.etat, enRetard && styles.etatAlerte]}>
          {enRetard
            ? `À retirer depuis ${formatDuree(Math.max(1, p.retardMinutes))} (prévu à ${heure(p.retraitPrevu, tz)})`
            : `Retrait prévu à ${heure(p.retraitPrevu, tz)} · encore ${formatDuree(p.resteMinutes)}`}
        </Text>
        <ChampHeure libelle="Retiré à" valeur={heureRetrait} onChange={setHeureRetrait} />
        <Pressable
          style={[styles.bouton, !enRetard && styles.boutonSecondaire]}
          onPress={() =>
            Alert.alert('Retirer le patch ?', 'Le rappel de retrait sera annulé.', [
              { text: 'Annuler', style: 'cancel' },
              { text: 'Retirer', onPress: () => onRetirerPatch(heureRetrait) },
            ])
          }
          accessibilityRole="button"
        >
          <Text style={[styles.boutonTexte, !enRetard && styles.boutonTexteSecondaire]}>J’ai retiré mon patch</Text>
        </Pressable>
        <Text style={styles.aide}>Un rappel est envoyé à l’heure du retrait, même pendant les heures calmes.</Text>
      </View>
    );
  }

  return (
    <View style={styles.carte}>
      <Text style={styles.petit}>Patch</Text>
      <Text style={styles.libelle}>Durée de port indiquée sur ta boîte</Text>
      <View style={styles.grille}>
        {([24, 16] as const).map((d) => (
          <Choix
            key={d}
            libelle={`${d} h`}
            actif={duree === d}
            onPress={() => {
              setDuree(d);
              setDosage(null);
            }}
          />
        ))}
      </View>
      <Text style={styles.libelle}>Dosage</Text>
      <View style={styles.grille}>
        {DOSAGES_PATCH[duree].map((d) => (
          <Choix key={d} libelle={mg(d)} actif={dosage === d} onPress={() => setDosage(d)} />
        ))}
      </View>
      <ChampHeure libelle="Posé à" valeur={heurePose} onChange={setHeurePose} />
      <Pressable
        style={[styles.bouton, dosage === null && styles.inactif]}
        disabled={dosage === null}
        onPress={() => dosage !== null && onPoserPatch(dosage, duree, heurePose)}
        accessibilityRole="button"
      >
        <Text style={styles.boutonTexte}>J’ai posé mon patch</Text>
      </Pressable>
      <Text style={styles.aide}>Posé plus tôt ? Indique l’heure (ex. 07:30) : Déclic saura quelles cigarettes ont été fumées sous patch, calcule l’heure de retrait et te la rappelle.</Text>
    </View>
  );
}

function CarteOral({ forme, tdb, tz, maintenant, onPrendre }: Props & { forme: TypeSubstitutOral }) {
  const etat = tdb.oraux.find((o) => o.forme === forme);
  const [choisi, setChoisi] = useState<number | null>(null);
  const dosage = choisi ?? etat?.dernierDosageMg ?? null;
  const [un, plusieurs] = NOMS[forme];
  const n = etat?.prisesAujourdhui ?? 0;
  const depuis = etat?.derniereA != null ? Math.max(0, Math.round((maintenant - etat.derniereA) / 60_000)) : null;

  return (
    <View style={[styles.carte, etat?.maxAtteint && styles.carteAlerte]}>
      <Text style={styles.petit}>{forme === 'pastille' ? 'Pastilles' : 'Gommes'}</Text>
      <View style={styles.ligneChiffres}>
        <View style={styles.flex}>
          <Text style={styles.grand}>{etat?.maxParJour != null ? `${n} / ${etat.maxParJour}` : n}</Text>
          <Text style={styles.sous}>aujourd’hui</Text>
        </View>
        <View style={styles.flex}>
          <Text style={styles.grand}>{depuis === null ? '—' : depuis < 1 ? '< 1 min' : formatDuree(depuis)}</Text>
          <Text style={styles.sous}>{etat?.derniereA != null ? `depuis la dernière (${heure(etat.derniereA, tz)})` : 'depuis la dernière'}</Text>
        </View>
      </View>
      <Text style={styles.libelle}>Dosage</Text>
      <View style={styles.grille}>
        {DOSAGES_ORAUX[forme].map((d) => (
          <Choix key={d} libelle={mg(d)} actif={dosage === d} onPress={() => setChoisi(d)} />
        ))}
      </View>
      <Pressable
        style={[styles.bouton, dosage === null && styles.inactif]}
        disabled={dosage === null}
        onPress={() => dosage !== null && onPrendre(forme, dosage)}
        accessibilityRole="button"
      >
        <Text style={styles.boutonTexte}>{`J’ai pris 1 ${un}`}</Text>
      </Pressable>
      {etat?.maxAtteint && <Text style={styles.etatAlerte}>Maximum de la notice atteint pour aujourd’hui : parles-en à ton pharmacien.</Text>}
      {n > 1 && <Text style={styles.aide}>{`${n} ${plusieurs} aujourd’hui.`}</Text>}
    </View>
  );
}

export function SubstitutsScreen(props: Props) {
  return (
    <Modal visible animationType="slide" onRequestClose={props.onFermer}>
      <SafeAreaView style={styles.page} edges={['top', 'bottom']}>
        <View style={styles.entete}>
          <Text style={styles.titre}>Substituts</Text>
          <Pressable onPress={props.onFermer} accessibilityRole="button" hitSlop={8}>
            <Text style={styles.fermer}>Fermer</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.contenu}>
          <CartePatch {...props} />
          <CarteOral {...props} forme="pastille" />
          <CarteOral {...props} forme="gomme" />
          <Text style={styles.mention}>
            Déclic note ce que tu prends, il ne prescrit rien. Le dosage se choisit avec un médecin, un pharmacien ou un tabacologue · Tabac Info Service : 39 89
          </Text>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  ligneHeure: { flexDirection: 'row', alignItems: 'center', gap: espace(2), marginTop: espace(3) },
  libelleHeure: { color: couleurs.encre, fontSize: 15 },
  champHeure: { width: 110, borderWidth: 1, borderColor: couleurs.ligne, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, fontSize: 16, color: couleurs.encre },
  page: { flex: 1, backgroundColor: couleurs.fond },
  entete: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: espace(4), paddingVertical: espace(3) },
  titre: { color: couleurs.encre, fontSize: 26, fontWeight: '800' },
  fermer: { color: couleurs.vert, fontSize: 16, fontWeight: '700' },
  contenu: { paddingHorizontal: espace(4), paddingBottom: espace(8), gap: espace(3) },
  carte: { backgroundColor: couleurs.carte, borderRadius: 18, borderWidth: 1, borderColor: couleurs.ligne, padding: espace(4), gap: espace(2) },
  carteAlerte: { borderColor: couleurs.rouge, backgroundColor: couleurs.rougeClair },
  petit: { color: couleurs.doux, fontSize: 15, fontWeight: '700', textTransform: 'uppercase' },
  grand: { color: couleurs.encre, fontSize: 28, fontWeight: '800', fontVariant: ['tabular-nums'] },
  sous: { color: couleurs.doux, fontSize: 15 },
  etat: { color: couleurs.vert, fontSize: 15, fontWeight: '600' },
  etatAlerte: { color: couleurs.rouge, fontSize: 14, fontWeight: '700' },
  libelle: { color: couleurs.encre, fontSize: 14, fontWeight: '600', marginTop: espace(1) },
  ligneChiffres: { flexDirection: 'row', gap: espace(3) },
  flex: { flex: 1 },
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
  mention: { color: couleurs.doux, fontSize: 14, textAlign: 'center', lineHeight: 17 },
});

import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { NouveauProfil } from '../application/declic';
import { couleurs, espace } from './theme';

interface Props {
  onValider: (profil: NouveauProfil) => Promise<void>;
}

const HEURE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function OnboardingScreen({ onValider }: Props) {
  const [parJour, setParJour] = useState('20');
  const [prix, setPrix] = useState('13,00');
  const [parPaquet, setParPaquet] = useState('20');
  const [lever, setLever] = useState('07:00');
  const [coucher, setCoucher] = useState('23:00');
  const [erreur, setErreur] = useState<string | null>(null);

  async function valider() {
    const n = Number.parseInt(parJour, 10);
    const prixCents = Math.round(Number.parseFloat(prix.replace(',', '.')) * 100);
    const paquet = Number.parseInt(parPaquet, 10);
    if (!(n >= 1 && n <= 100)) return setErreur('Indique un nombre de cigarettes par jour entre 1 et 100.');
    if (!(prixCents > 0)) return setErreur('Indique le prix de ton paquet.');
    if (!(paquet > 0)) return setErreur('Indique le nombre de cigarettes par paquet.');
    if (!HEURE.test(lever) || !HEURE.test(coucher)) return setErreur('Les heures se saisissent au format HH:MM.');
    setErreur(null);
    await onValider({ cigarettesParJour: n, prixPaquetCents: prixCents, cigarettesParPaquet: paquet, lever, coucher });
  }

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <Text style={styles.marque}>Déclic</Text>
      <Text style={styles.titre}>Une cigarette de moins chaque jour.</Text>
      <Text style={styles.texte}>
        Dis-moi où tu en es. Je calcule ton plan, ton rythme de la journée et ce que tu économises.
      </Text>

      <Champ libelle="Cigarettes par jour aujourd'hui" valeur={parJour} onChange={setParJour} clavier="number-pad" />
      <Champ libelle="Prix du paquet (€)" valeur={prix} onChange={setPrix} clavier="decimal-pad" />
      <Champ libelle="Cigarettes par paquet" valeur={parPaquet} onChange={setParPaquet} clavier="number-pad" />
      <View style={styles.ligne}>
        <View style={styles.demi}>
          <Champ libelle="Lever" valeur={lever} onChange={setLever} clavier="numbers-and-punctuation" />
        </View>
        <View style={styles.demi}>
          <Champ libelle="Coucher" valeur={coucher} onChange={setCoucher} clavier="numbers-and-punctuation" />
        </View>
      </View>

      {erreur && <Text style={styles.erreur}>{erreur}</Text>}

      <Pressable style={styles.bouton} onPress={valider} accessibilityRole="button">
        <Text style={styles.boutonTexte}>Commencer mon plan</Text>
      </Pressable>
      <Text style={styles.mention}>
        Tes données restent sur ce téléphone. Déclic ne remplace pas un avis médical.
      </Text>
    </ScrollView>
  );
}

function Champ(props: {
  libelle: string;
  valeur: string;
  onChange: (v: string) => void;
  clavier: 'number-pad' | 'decimal-pad' | 'numbers-and-punctuation';
}) {
  return (
    <View style={styles.champ}>
      <Text style={styles.libelle}>{props.libelle}</Text>
      <TextInput
        style={styles.input}
        value={props.valeur}
        onChangeText={props.onChange}
        keyboardType={props.clavier}
        accessibilityLabel={props.libelle}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: espace(6), paddingTop: espace(16), backgroundColor: couleurs.fond, flexGrow: 1 },
  marque: { color: couleurs.vert, fontSize: 14, fontWeight: '700', letterSpacing: 2, textTransform: 'uppercase' },
  titre: { color: couleurs.encre, fontSize: 30, fontWeight: '700', marginTop: espace(2), lineHeight: 36 },
  texte: { color: couleurs.doux, fontSize: 16, marginTop: espace(3), marginBottom: espace(6), lineHeight: 22 },
  champ: { marginBottom: espace(4) },
  libelle: { color: couleurs.encre, fontSize: 14, fontWeight: '600', marginBottom: espace(1) },
  input: {
    backgroundColor: couleurs.carte,
    borderColor: couleurs.ligne,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: espace(4),
    paddingVertical: espace(3),
    fontSize: 18,
    color: couleurs.encre,
  },
  ligne: { flexDirection: 'row', gap: espace(3) },
  demi: { flex: 1 },
  erreur: { color: couleurs.ambre, marginBottom: espace(3) },
  bouton: { backgroundColor: couleurs.vert, borderRadius: 14, paddingVertical: espace(4), alignItems: 'center', marginTop: espace(2) },
  boutonTexte: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  mention: { color: couleurs.doux, fontSize: 13, textAlign: 'center', marginTop: espace(4) },
});

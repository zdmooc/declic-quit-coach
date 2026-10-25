import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import type { NouveauProfil } from '../application/declic';
import { couleurs, espace } from './theme';

interface Props {
  onValider: (profil: NouveauProfil) => Promise<void>;
  /** Nouveau téléphone : restaurer une sauvegarde au lieu de créer un profil. */
  onRestaurer?: () => void;
}

export function OnboardingScreen({ onValider, onRestaurer }: Props) {
  const [parJour, setParJour] = useState('20');
  const [prix, setPrix] = useState('13,00');
  const [parPaquet, setParPaquet] = useState('20');
  const [dejaFume, setDejaFume] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function valider() {
    const n = Number.parseInt(parJour, 10);
    const prixCents = Math.round(Number.parseFloat(prix.replace(',', '.')) * 100);
    const paquet = Number.parseInt(parPaquet, 10);
    if (!(n >= 1 && n <= 100)) return setErreur('Indique environ combien de cigarettes tu fumes par jour (1 à 100).');
    if (!(prixCents > 0)) return setErreur('Indique le prix de ton paquet.');
    if (!(paquet > 0)) return setErreur('Indique le nombre de cigarettes par paquet.');
    setErreur(null);
    await onValider({ cigarettesParJour: n, prixPaquetCents: prixCents, cigarettesParPaquet: paquet, dejaFumeAujourdhui: dejaFume });
  }

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <Text style={styles.marque}>Déclic</Text>
      <Text style={styles.titre}>Une cigarette de moins chaque jour.</Text>
      <Text style={styles.texte}>
        D’abord, on observe. Pendant 3 jours, fume normalement et appuie sur « J’ai fumé » à chaque cigarette. Je mesure ta
        vraie consommation, tes horaires et ce qui te donne envie. Ensuite, on lance ton plan.
      </Text>

      <Champ libelle="Environ combien de cigarettes par jour ?" valeur={parJour} onChange={setParJour} clavier="number-pad" />
      <Champ libelle="Prix du paquet (€)" valeur={prix} onChange={setPrix} clavier="decimal-pad" />
      <Champ libelle="Cigarettes par paquet" valeur={parPaquet} onChange={setParPaquet} clavier="number-pad" />

      <View style={styles.interrupteur}>
        <Text style={styles.libelleInterrupteur}>J’ai déjà fumé aujourd’hui</Text>
        <Switch value={dejaFume} onValueChange={setDejaFume} trackColor={{ true: couleurs.vert, false: couleurs.ligne }} />
      </View>
      <Text style={styles.aide}>
        {dejaFume
          ? 'L’observation commencera demain matin, avec une journée complète.'
          : 'L’observation commence dès ta première cigarette.'}
      </Text>

      {erreur && <Text style={styles.erreur}>{erreur}</Text>}

      <Pressable style={styles.bouton} onPress={valider} accessibilityRole="button">
        <Text style={styles.boutonTexte}>Commencer l’observation</Text>
      </Pressable>
      {onRestaurer && (
        <Pressable onPress={onRestaurer} accessibilityRole="button" hitSlop={8}>
          <Text style={styles.restaurer}>J’ai déjà une sauvegarde Déclic : la restaurer</Text>
        </Pressable>
      )}
      <Text style={styles.mention}>Tes données restent sur ce téléphone. Déclic ne remplace pas un avis médical.</Text>
    </ScrollView>
  );
}

function Champ(props: {
  libelle: string;
  valeur: string;
  onChange: (v: string) => void;
  clavier: 'number-pad' | 'decimal-pad';
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
  texte: { color: couleurs.doux, fontSize: 16, marginTop: espace(3), marginBottom: espace(6), lineHeight: 23 },
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
  interrupteur: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: couleurs.carte,
    borderColor: couleurs.ligne,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: espace(4),
    paddingVertical: espace(2),
  },
  libelleInterrupteur: { color: couleurs.encre, fontSize: 16, fontWeight: '600' },
  aide: { color: couleurs.doux, fontSize: 13, marginTop: espace(2), marginBottom: espace(4) },
  erreur: { color: couleurs.ambre, marginBottom: espace(3) },
  bouton: { backgroundColor: couleurs.vert, borderRadius: 14, paddingVertical: espace(4), alignItems: 'center', marginTop: espace(2) },
  boutonTexte: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  mention: { color: couleurs.doux, fontSize: 13, textAlign: 'center', marginTop: espace(4) },
  restaurer: { color: couleurs.vert, fontSize: 15, fontWeight: '600', textAlign: 'center', textDecorationLine: 'underline', marginTop: espace(4) },
});

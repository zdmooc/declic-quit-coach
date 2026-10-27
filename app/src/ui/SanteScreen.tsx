import { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Sante } from '../application/declic';
import { BOISSONS, OBJECTIFS, PARAMETRES, REPERE_CAFEINE_MG, type Boisson, type ClasseAliment, type SuiviCafeine, type Objectif, type Statut, type SuiviParametre } from '../domain';
import { couleurs, espace } from './theme';

/**
 * Santé (RM-23, RM-24) : bilans biologiques, valeurs hors norme et aliments classés selon toutes
 * les anomalies à la fois. L'app trace et classe ; l'objectif et le traitement relèvent du médecin.
 */
interface Props {
  sante: Sante;
  aujourdhui: string;
  onFermer: () => void;
  onSaisirBilan: (date: string, valeurs: Record<string, number>) => void;
  onSupprimerBilan: (id: string) => void;
  onNorme: (parametre: string, min?: number, max?: number) => void;
  cafeine: SuiviCafeine;
  onBoire: (b: Boisson) => void;
  onAnnulerBoisson: (id: string) => void;
  onPalierCafeine: (quota: number) => void;
}

const JOURS_COURTS = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];

/** Caféine (RM-25) : même méthode que la cigarette — observer, paliers, jamais au-dessus du précédent. */
function OngletCafeine({ c, onBoire, onAnnulerBoisson, onPalierCafeine }: { c: SuiviCafeine } & Pick<Props, 'onBoire' | 'onAnnulerBoisson' | 'onPalierCafeine'>) {
  const max = Math.max(1, ...c.parJour.map((j) => j.boissons), c.quota ?? 0);
  const propose = c.quota ?? Math.max(0, Math.ceil(c.moyenneParJour ?? c.aujourdhui.boissons));
  const depasse = c.quota !== null && c.aujourdhui.boissons > c.quota;
  return (
    <>
      <View style={styles.carte}>
        <Text style={styles.petit}>Aujourd’hui</Text>
        <Text style={[styles.valeur, depasse && { color: couleurs.rouge }]}>
          {c.aujourdhui.boissons}
          {c.quota !== null ? ` / ${c.quota}` : ''} <Text style={styles.unite}>boisson{c.aujourdhui.boissons > 1 ? 's' : ''} caféinée{c.aujourdhui.boissons > 1 ? 's' : ''}</Text>
        </Text>
        <Text style={styles.aide}>
          ≈ {c.aujourdhui.mg} mg de caféine · repère adulte {REPERE_CAFEINE_MG} mg / jour (EFSA)
        </Text>
        <View style={styles.grilleBoissons}>
          {BOISSONS.map((b) => (
            <Pressable key={b.cle} style={styles.puce} onPress={() => onBoire(b.cle)} accessibilityRole="button" accessibilityLabel={`J’ai bu : ${b.nom}`}>
              <Text style={styles.puceTexte}>+ {b.nom}</Text>
            </Pressable>
          ))}
        </View>
        {c.derniere && (
          <Pressable onPress={() => onAnnulerBoisson(c.derniere!.id)} accessibilityRole="button" hitSlop={6}>
            <Text style={styles.lien}>Annuler la dernière ({BOISSONS.find((b) => b.cle === c.derniere!.boisson)?.nom})</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.carte}>
        <Text style={styles.petit}>7 derniers jours</Text>
        <View style={styles.barres}>
          {c.parJour.map((j) => (
            <View key={j.jour} style={styles.colonne}>
              <Text style={styles.valeurBarre}>{j.boissons}</Text>
              <View style={styles.zoneBarre}>
                <View
                  style={[
                    styles.barre,
                    {
                      height: `${Math.max(4, (j.boissons / max) * 100)}%`,
                      backgroundColor: c.quota !== null && j.boissons > c.quota ? couleurs.rouge : j.boissons > 0 ? couleurs.vert : couleurs.ligne,
                    },
                  ]}
                />
              </View>
              <Text style={styles.dateBarre}>{JOURS_COURTS[new Date(`${j.jour}T12:00:00Z`).getUTCDay()]}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.aide}>
          {c.moyenneParJour !== null ? `Moyenne : ${nombre(c.moyenneParJour)} par jour (journées terminées). ` : 'La moyenne arrive après ta première journée complète. '}
          {c.totalSept > 0 ? `${c.suiviesDeCigarette} sur ${c.totalSept} suivies d’une cigarette dans les 20 min.` : ''}
        </Text>
      </View>

      <View style={styles.carte}>
        <Text style={styles.petit}>Palier</Text>
        <Text style={styles.texte}>
          {c.quota === null
            ? 'Observe quelques jours, puis fixe ton premier palier. Ensuite, tu descends quand tu es prêt, et tu ne remontes jamais au-dessus du palier précédent.'
            : `Palier actuel : ${c.quota} par jour. Tu peux seulement descendre.`}
        </Text>
        <View style={styles.ligneSaisie}>
          {c.quota === null ? (
            <Pressable style={[styles.bouton, styles.flex]} onPress={() => onPalierCafeine(propose)} accessibilityRole="button">
              <Text style={styles.boutonTexte}>Fixer mon palier à {propose}</Text>
            </Pressable>
          ) : (
            <Pressable
              style={[styles.bouton, styles.flex, c.quota === 0 && styles.inactif]}
              disabled={c.quota === 0}
              onPress={() =>
                Alert.alert(`Descendre à ${c.quota! - 1} par jour ?`, 'Tu ne pourras plus remonter au-dessus.', [
                  { text: 'Annuler', style: 'cancel' },
                  { text: 'Descendre', onPress: () => onPalierCafeine(c.quota! - 1) },
                ])
              }
              accessibilityRole="button"
            >
              <Text style={styles.boutonTexte}>Descendre à {Math.max(0, c.quota - 1)}</Text>
            </Pressable>
          )}
        </View>
        <Text style={styles.aide}>Le café est souvent associé à la cigarette : passer au déca ou changer de lieu pour le café aide aussi à fumer moins.</Text>
      </View>
    </>
  );
}

const nombre = (v: number) => String(Math.round(v * 100) / 100).replace('.', ',');
const lire = (t: string): number | undefined => {
  const n = Number(t.trim().replace(',', '.'));
  return t.trim() === '' || !Number.isFinite(n) ? undefined : n;
};
const dateCourte = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(2, 4)}`;

const STATUTS: Record<Statut, { texte: string; couleur: string; fond: string }> = {
  haut: { texte: 'trop haut', couleur: couleurs.rouge, fond: couleurs.rougeClair },
  bas: { texte: 'trop bas', couleur: couleurs.rouge, fond: couleurs.rougeClair },
  'proche-haut': { texte: 'à surveiller', couleur: couleurs.ambre, fond: couleurs.ambreClair },
  'proche-bas': { texte: 'à surveiller', couleur: couleurs.ambre, fond: couleurs.ambreClair },
  normal: { texte: 'dans la norme', couleur: couleurs.vert, fond: couleurs.vertClair },
};

const nomObjectif = (o: Objectif) => OBJECTIFS[o].titre.replace(/^(Baisser|Monter|Mieux contrôler|Réduire) (le |la |les |l’)?/, '');

function libelleNorme(n: { min?: number; max?: number }, unite: string): string {
  if (n.min !== undefined && n.max !== undefined) return `${nombre(n.min)} à ${nombre(n.max)} ${unite}`;
  if (n.max !== undefined) return `< ${nombre(n.max)} ${unite}`;
  if (n.min !== undefined) return `> ${nombre(n.min)} ${unite}`;
  return 'aucune';
}

function CarteParametre({ s, onNorme }: { s: SuiviParametre; onNorme: Props['onNorme'] }) {
  const [edition, setEdition] = useState<{ min: string; max: string } | null>(null);
  const p = s.parametre;
  const d = s.derniere!;
  const st = STATUTS[d.statut];
  // Une baisse est un progrès pour un paramètre « trop haut », une hausse pour un paramètre « trop bas ».
  const bonSens = s.evolution === null ? null : p.siBas && !p.siHaut ? s.evolution > 0 : s.evolution < 0;
  const max = Math.max(...s.points.map((x) => x.valeur), s.norme.max ?? 0);
  return (
    <View style={styles.carte}>
      <View style={styles.ligneEntre}>
        <Text style={styles.nom}>{p.nom}</Text>
        <Text style={[styles.statut, { color: st.couleur, backgroundColor: st.fond }]}>{st.texte}</Text>
      </View>
      <Text style={styles.valeur}>
        {nombre(d.valeur)} <Text style={styles.unite}>{p.unite}</Text>
        {s.evolution !== null && (
          <Text style={[styles.evolution, { color: bonSens ? couleurs.vert : couleurs.rouge }]}>
            {'  '}
            {s.evolution < 0 ? '↓' : '↑'} {nombre(Math.abs(s.evolution))} %
          </Text>
        )}
      </Text>
      <View style={styles.barres}>
        {s.points.map((x) => (
          <View key={x.date} style={styles.colonne}>
            <Text style={styles.valeurBarre}>{nombre(x.valeur)}</Text>
            <View style={styles.zoneBarre}>
              <View style={[styles.barre, { height: `${Math.max(6, (x.valeur / (max || 1)) * 100)}%`, backgroundColor: x.date === d.date ? st.couleur : couleurs.ligne }]} />
            </View>
            <Text style={styles.dateBarre}>{dateCourte(x.date)}</Text>
          </View>
        ))}
      </View>
      {edition === null ? (
        <Pressable onPress={() => setEdition({ min: s.norme.min !== undefined ? nombre(s.norme.min) : '', max: s.norme.max !== undefined ? nombre(s.norme.max) : '' })} accessibilityRole="button" hitSlop={6}>
          <Text style={styles.aide}>
            Norme : {libelleNorme(s.norme, p.unite)} · <Text style={styles.lien}>modifier</Text>
          </Text>
        </Pressable>
      ) : (
        <View style={styles.ligneSaisie}>
          <Text style={styles.aide}>min</Text>
          <TextInput style={styles.champCourt} value={edition.min} onChangeText={(t) => setEdition({ ...edition, min: t })} keyboardType="decimal-pad" accessibilityLabel={`Minimum ${p.nom}`} />
          <Text style={styles.aide}>max</Text>
          <TextInput style={styles.champCourt} value={edition.max} onChangeText={(t) => setEdition({ ...edition, max: t })} keyboardType="decimal-pad" accessibilityLabel={`Maximum ${p.nom}`} />
          <Pressable
            onPress={() => {
              onNorme(p.cle, lire(edition.min), lire(edition.max));
              setEdition(null);
            }}
            accessibilityRole="button"
            hitSlop={6}
          >
            <Text style={styles.ok}>OK</Text>
          </Pressable>
        </View>
      )}
      {p.note && <Text style={styles.aide}>{p.note}</Text>}
    </View>
  );
}

function FormulaireBilan({ aujourdhui, onSaisir, onAnnuler }: { aujourdhui: string; onSaisir: Props['onSaisirBilan']; onAnnuler: () => void }) {
  const [date, setDate] = useState(aujourdhui);
  const [champs, setChamps] = useState<Record<string, string>>({});
  const valeurs = Object.fromEntries(
    Object.entries(champs)
      .map(([k, t]) => [k, lire(t)] as const)
      .filter((x): x is readonly [string, number] => x[1] !== undefined),
  );
  const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(date);
  const pret = dateOk && Object.keys(valeurs).length > 0;
  return (
    <View style={styles.carte}>
      <Text style={styles.petit}>Nouveau bilan</Text>
      <View style={styles.ligneSaisie}>
        <Text style={styles.libelleChamp}>Date du prélèvement</Text>
        <TextInput style={styles.champ} value={date} onChangeText={setDate} placeholder="2026-10-16" placeholderTextColor={couleurs.doux} maxLength={10} accessibilityLabel="Date du prélèvement, format 2026-10-16" />
      </View>
      {PARAMETRES.filter((p) => !p.calcule).map((p) => (
        <View key={p.cle} style={styles.ligneSaisie}>
          <Text style={styles.libelleChamp}>
            {p.nom} <Text style={styles.unite}>({p.unite})</Text>
          </Text>
          <TextInput
            style={styles.champ}
            value={champs[p.cle] ?? ''}
            onChangeText={(t) => setChamps({ ...champs, [p.cle]: t })}
            keyboardType="decimal-pad"
            placeholder="—"
            placeholderTextColor={couleurs.doux}
            accessibilityLabel={`${p.nom} en ${p.unite}`}
          />
        </View>
      ))}
      <Text style={styles.aide}>Laisse vide ce qui n’a pas été mesuré. Le non-HDL est calculé (total − HDL).</Text>
      <Pressable style={[styles.bouton, !pret && styles.inactif]} disabled={!pret} onPress={() => onSaisir(date, valeurs)} accessibilityRole="button">
        <Text style={styles.boutonTexte}>Enregistrer le bilan</Text>
      </Pressable>
      <Pressable onPress={onAnnuler} accessibilityRole="button" style={styles.annuler}>
        <Text style={styles.lien}>Annuler</Text>
      </Pressable>
    </View>
  );
}

function LigneAliment({ c, ton }: { c: ClasseAliment; ton: 'vert' | 'rouge' | 'neutre' }) {
  const detail =
    ton === 'rouge'
      ? `aggrave : ${c.aggrave.map(nomObjectif).join(', ')}${c.aide.length ? ` (aide : ${c.aide.map(nomObjectif).join(', ')})` : ''}`
      : ton === 'vert'
        ? `aide : ${c.aide.map(nomObjectif).join(', ')}`
        : null;
  return (
    <View style={styles.aliment}>
      <Text style={styles.nomAliment}>
        {ton === 'vert' ? '🟢 ' : ton === 'rouge' ? '🔴 ' : '⚪ '}
        {c.aliment.nom}
      </Text>
      {detail && <Text style={styles.aide}>{detail}</Text>}
      {c.aliment.attention && <Text style={[styles.aide, { color: couleurs.ambre }]}>⚠️ {c.aliment.attention}</Text>}
    </View>
  );
}

export function SanteScreen({ sante, aujourdhui, onFermer, onSaisirBilan, onSupprimerBilan, onNorme, cafeine, onBoire, onAnnulerBoisson, onPalierCafeine }: Props) {
  const [onglet, setOnglet] = useState<'bilans' | 'aliments' | 'cafeine'>('bilans');
  const [saisie, setSaisie] = useState(false);
  const { privilegier, eliminer, neutres } = sante.aliments;
  return (
    <Modal visible animationType="slide" onRequestClose={onFermer}>
      <SafeAreaView style={styles.page} edges={['top', 'bottom']}>
        <View style={styles.entete}>
          <Text style={styles.titre}>Santé</Text>
          <Pressable onPress={onFermer} accessibilityRole="button" hitSlop={10}>
            <Text style={styles.fermer}>Fermer</Text>
          </Pressable>
        </View>
        <View style={styles.onglets}>
          {(['bilans', 'aliments', 'cafeine'] as const).map((o) => (
            <Pressable key={o} style={[styles.onglet, onglet === o && styles.ongletActif]} onPress={() => setOnglet(o)} accessibilityRole="tab" accessibilityState={{ selected: onglet === o }}>
              <Text style={[styles.ongletTexte, onglet === o && styles.ongletTexteActif]}>{o === 'bilans' ? 'Bilans' : o === 'aliments' ? 'Aliments' : 'Caféine'}</Text>
            </Pressable>
          ))}
        </View>
        <ScrollView contentContainerStyle={styles.contenu} keyboardShouldPersistTaps="handled">
          {onglet === 'cafeine' ? (
            <OngletCafeine c={cafeine} onBoire={onBoire} onAnnulerBoisson={onAnnulerBoisson} onPalierCafeine={onPalierCafeine} />
          ) : onglet === 'bilans' ? (
            <>
              {saisie ? (
                <FormulaireBilan
                  aujourdhui={aujourdhui}
                  onAnnuler={() => setSaisie(false)}
                  onSaisir={(d, v) => {
                    setSaisie(false);
                    onSaisirBilan(d, v);
                  }}
                />
              ) : (
                <Pressable style={styles.bouton} onPress={() => setSaisie(true)} accessibilityRole="button">
                  <Text style={styles.boutonTexte}>+ Nouveau bilan</Text>
                </Pressable>
              )}
              {sante.suivi.length === 0 && !saisie && <Text style={styles.aide}>Saisis ton dernier bilan sanguin pour suivre son évolution.</Text>}
              {sante.suivi.map((s) => (
                <CarteParametre key={s.parametre.cle} s={s} onNorme={onNorme} />
              ))}
              {sante.bilans.length > 0 && (
                <View style={styles.carte}>
                  <Text style={styles.petit}>Bilans enregistrés</Text>
                  {sante.bilans.map((b) => (
                    <View key={b.id} style={styles.ligneEntre}>
                      <Text style={styles.aide}>
                        {dateCourte(b.date)} · {Object.keys(b.valeurs).length} valeur{Object.keys(b.valeurs).length > 1 ? 's' : ''}
                      </Text>
                      <Pressable
                        onPress={() =>
                          Alert.alert('Supprimer ce bilan ?', `Bilan du ${dateCourte(b.date)}`, [
                            { text: 'Annuler', style: 'cancel' },
                            { text: 'Supprimer', style: 'destructive', onPress: () => onSupprimerBilan(b.id) },
                          ])
                        }
                        accessibilityRole="button"
                        accessibilityLabel={`Supprimer le bilan du ${dateCourte(b.date)}`}
                        hitSlop={8}
                      >
                        <Text style={styles.supprimer}>✕</Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
              )}
            </>
          ) : (
            <>
              {sante.objectifs.length === 0 ? (
                <Text style={styles.aide}>Saisis un bilan : les aliments seront classés selon tes valeurs hors norme ou à surveiller.</Text>
              ) : (
                <View style={styles.carte}>
                  <Text style={styles.petit}>Tes objectifs (dernier bilan)</Text>
                  {sante.objectifs.map((o) => (
                    <View key={o.objectif} style={styles.objectif}>
                      <Text style={styles.nom}>{OBJECTIFS[o.objectif].titre}</Text>
                      <Text style={styles.aide}>À cause de : {o.raisons.join(', ')}</Text>
                      <Text style={styles.texte}>{OBJECTIFS[o.objectif].conseil}</Text>
                    </View>
                  ))}
                  <Text style={styles.aide}>Règle : un aliment n’est conseillé que s’il n’aggrave aucun de tes objectifs.</Text>
                </View>
              )}
              {sante.objectifs.length > 0 && (
                <>
                  <View style={styles.carte}>
                    <Text style={styles.petit}>À privilégier</Text>
                    {privilegier.map((c) => (
                      <LigneAliment key={c.aliment.nom} c={c} ton="vert" />
                    ))}
                  </View>
                  <View style={styles.carte}>
                    <Text style={styles.petit}>À éliminer</Text>
                    {eliminer.map((c) => (
                      <LigneAliment key={c.aliment.nom} c={c} ton="rouge" />
                    ))}
                  </View>
                  <View style={styles.carte}>
                    <Text style={styles.petit}>Sans effet notable sur tes objectifs</Text>
                    {neutres.map((c) => (
                      <LigneAliment key={c.aliment.nom} c={c} ton="neutre" />
                    ))}
                  </View>
                </>
              )}
              <Text style={styles.mention}>Repères généraux (ESC/EAS, ANSES). Ils ne remplacent pas l’avis de ton médecin, qui fixe tes objectifs et ton traitement.</Text>
            </>
          )}
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
  onglets: { flexDirection: 'row', backgroundColor: couleurs.ligne, borderRadius: 12, padding: 3, marginHorizontal: espace(4), marginBottom: espace(2) },
  onglet: { flex: 1, paddingVertical: espace(2), borderRadius: 10, alignItems: 'center' },
  ongletActif: { backgroundColor: couleurs.carte },
  ongletTexte: { color: couleurs.doux, fontSize: 15, fontWeight: '600' },
  ongletTexteActif: { color: couleurs.vert, fontWeight: '800' },
  contenu: { paddingHorizontal: espace(4), paddingBottom: espace(8), gap: espace(3) },
  carte: { backgroundColor: couleurs.carte, borderRadius: 18, borderWidth: 1, borderColor: couleurs.ligne, padding: espace(4), gap: espace(2) },
  petit: { color: couleurs.doux, fontSize: 15, fontWeight: '700', textTransform: 'uppercase' },
  ligneEntre: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: espace(2) },
  nom: { color: couleurs.encre, fontSize: 17, fontWeight: '700', flexShrink: 1 },
  statut: { fontSize: 13, fontWeight: '800', paddingHorizontal: espace(2), paddingVertical: 2, borderRadius: 999, overflow: 'hidden' },
  valeur: { color: couleurs.encre, fontSize: 26, fontWeight: '800', fontVariant: ['tabular-nums'] },
  unite: { color: couleurs.doux, fontSize: 14, fontWeight: '400' },
  evolution: { fontSize: 16, fontWeight: '800' },
  barres: { flexDirection: 'row', alignItems: 'flex-end', gap: espace(2), height: 110 },
  colonne: { flex: 1, alignItems: 'center', maxWidth: 64 },
  valeurBarre: { color: couleurs.doux, fontSize: 12, fontVariant: ['tabular-nums'] },
  zoneBarre: { height: 64, width: '70%', justifyContent: 'flex-end' },
  barre: { width: '100%', borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  dateBarre: { color: couleurs.doux, fontSize: 11, marginTop: 2 },
  aide: { color: couleurs.doux, fontSize: 15, lineHeight: 20 },
  texte: { color: couleurs.encre, fontSize: 15, lineHeight: 21 },
  lien: { color: couleurs.vert, fontWeight: '700' },
  ligneSaisie: { flexDirection: 'row', alignItems: 'center', gap: espace(2) },
  libelleChamp: { color: couleurs.encre, fontSize: 15, flex: 1 },
  champ: { width: 110, borderWidth: 1, borderColor: couleurs.ligne, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, fontSize: 16, color: couleurs.encre, textAlign: 'right' },
  champCourt: { width: 70, borderWidth: 1, borderColor: couleurs.vert, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 4, fontSize: 15, color: couleurs.encre },
  ok: { color: couleurs.vert, fontWeight: '800', fontSize: 16 },
  bouton: { backgroundColor: couleurs.vert, borderRadius: 16, paddingVertical: espace(3), alignItems: 'center' },
  boutonTexte: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  inactif: { opacity: 0.4 },
  annuler: { alignItems: 'center', paddingVertical: espace(1) },
  supprimer: { color: couleurs.rouge, fontSize: 20, fontWeight: '700', paddingHorizontal: 4 },
  objectif: { gap: 2, paddingBottom: espace(2), borderBottomWidth: 1, borderBottomColor: couleurs.ligne },
  aliment: { gap: 2, paddingVertical: espace(1) },
  nomAliment: { color: couleurs.encre, fontSize: 16, fontWeight: '600' },
  grilleBoissons: { flexDirection: 'row', flexWrap: 'wrap', gap: espace(2) },
  puce: { borderWidth: 1.5, borderColor: couleurs.vert, borderRadius: 999, paddingHorizontal: espace(3), paddingVertical: espace(1) + 2 },
  puceTexte: { color: couleurs.vert, fontSize: 15, fontWeight: '700' },
  flex: { flex: 1 },
  mention: { color: couleurs.doux, fontSize: 13, textAlign: 'center' },
});

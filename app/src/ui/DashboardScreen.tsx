import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatDuree, formatEuros, moyenneEnDirect, type TableauDeBord } from '../domain';
import { couleurs, espace } from './theme';

interface Props {
  tdb: TableauDeBord;
  tz: string;
  onFume: () => void;
  onResiste: () => void;
  onAnnuler: () => void;
  onPalier: () => void;
  onDemarrerPlan: () => void;
  onHistorique: () => void;
  onSubstituts: () => void;
  onProgres: () => void;
  onSante: () => void;
  onCafe: () => void;
  onReglages: () => void;
  /** Appelé quand le compte à rebours arrive à zéro (pour rafraîchir l'état). */
  onEcheance: () => void;
  onSos: () => void;
  /** Vrai si les notifications n'ont pas pu être activées (Expo Go trop ancien). */
  notificationsIndisponibles?: boolean;
}

const heure = (t: number, tz: string) =>
  new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: tz }).format(t);

const dateCourte = (jour: string) =>
  new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(Date.parse(`${jour}T12:00:00Z`));

const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`;

/** Compte à rebours « mm:ss » (ou « h:mm:ss »), rafraîchi chaque seconde. */
function formatRebours(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const deux = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${deux(m)}:${deux(s)}` : `${deux(m)}:${deux(s)}`;
}

function useMaintenant(): number {
  const [maintenant, setMaintenant] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setMaintenant(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return maintenant;
}

/** Bandeau du haut : compte à rebours, ou état de la journée. */
function Rebours({ tdb, tz, onEcheance, onDemarrerPlan }: Pick<Props, 'tdb' | 'tz' | 'onEcheance' | 'onDemarrerPlan'>) {
  const maintenant = useMaintenant();
  const p = tdb.prochaine;
  const reste = p?.statut === 'attendre' ? p.a - maintenant : null;

  const echu = reste !== null && reste <= 0;
  useEffect(() => {
    if (echu) onEcheance();
  }, [echu, onEcheance]);

  const obs = tdb.observation;
  if (obs?.terminee && obs.habitudes) {
    return (
      <View style={styles.hero}>
        <Text style={styles.heroPetit}>Ton bilan d’observation</Text>
        <Text style={styles.heroTitre}>≈ {pluriel(Math.round(obs.habitudes.cigarettesParJour), 'cigarette')} / jour</Text>
        <Text style={styles.heroSous}>
          de {obs.habitudes.debutHabituel} à {obs.habitudes.finHabituelle} · plan : {obs.proposition.quotaDepart} le{' '}
          {dateCourte(obs.proposition.dateDebut)}, puis −1 par jour
        </Text>
        <Pressable style={styles.heroBouton} onPress={onDemarrerPlan} accessibilityRole="button">
          <Text style={styles.heroBoutonTexte}>Démarrer mon plan</Text>
        </Pressable>
      </View>
    );
  }

  const indicatif = tdb.sourceIntervalle === 'habitude';
  let petit = '';
  let grand = '';
  let sous = '';
  // Un seul compteur : « − » (ambre) jusqu'à l'intervalle recommandé, puis « + » (vert) au-delà.
  let signe: 'moins' | 'plus' | null = null;
  if (tdb.phase === 'avant-debut') {
    grand = 'Plan demain';
    sous = 'Continue de noter tes cigarettes ce soir.';
  } else if (!p || p.statut === 'arret') {
    petit = 'Journée sans tabac';
    grand = tdb.depuisDerniereMinutes === null ? '0' : formatDuree(tdb.depuisDerniereMinutes);
    sous = 'sans fumer';
  } else if (p.statut === 'quota-atteint') {
    petit = 'Quota du jour atteint';
    grand = '0 restante';
    sous = 'Une envie ? « J’ai résisté » est là.';
  } else if (p.statut === 'attendre' && reste !== null && reste > 0) {
    petit = 'Objectif dans';
    grand = `−${formatRebours(reste)}`;
    signe = 'moins';
    sous = `à ${heure(p.a, tz)}${indicatif ? ' · indicatif, fume normalement' : ''}`;
  } else if (p.statut === 'disponible' && p.depuis === null) {
    petit = 'Ta journée n’a pas commencé';
    grand = '—';
    sous = indicatif ? 'Ta première cigarette ouvrira la journée.' : 'Et si tu repoussais la première un peu ?';
  } else if (p.statut === 'disponible' && p.depuis !== null) {
    petit = 'Au-delà de l’objectif';
    grand = `+${formatRebours(Math.max(0, maintenant - p.depuis))}`;
    signe = 'plus';
    sous = `objectif atteint à ${heure(p.depuis, tz)} · ${indicatif ? 'fume normalement, et note-la' : 'chaque minute de plus compte'}`;
  } else {
    petit = indicatif ? 'Intervalle recommandé atteint' : 'Tu peux fumer ta prochaine';
    grand = '00:00';
    sous = indicatif ? 'Fume normalement, et note-la.' : 'Ou tiens 10 minutes de plus : chaque minute compte.';
  }

  // Moyenne des écarts du jour, pause en cours comprise : elle monte tant que tu tiens.
  const enDirect = signe !== null && tdb.derniereDuJourA !== null ? moyenneEnDirect(tdb.intervallesJourMinutes, tdb.derniereDuJourA, maintenant) : null;

  return (
    <View style={[styles.hero, signe === 'moins' && styles.heroAmbre]}>
      {petit !== '' && <Text style={[styles.heroPetit, signe === 'moins' && styles.texteAmbre]}>{petit}</Text>}
      <Text style={[styles.rebours, signe === 'moins' && styles.texteAmbre]} adjustsFontSizeToFit numberOfLines={1}>
        {grand}
      </Text>
      <Text style={styles.heroSous}>{sous}</Text>
      {enDirect !== null && (
        <Text style={styles.heroMoyenne}>
          Moyenne du jour : <Text style={styles.heroMoyenneValeur}>{formatRebours(enDirect * 60_000)}</Text>
          {tdb.intervalleMoyenJourMinutes !== null && enDirect > tdb.intervalleMoyenJourMinutes + 0.02 ? '  ↑' : ''}
        </Text>
      )}
    </View>
  );
}

/** Pastille d'information : aspect de bouton, mais non cliquable. */
type Ton = 'neutre' | 'vert' | 'rouge';

interface InfoPastille {
  valeur: string;
  libelle: string;
  ton?: Ton;
}

function Pastille({ valeur, libelle, ton = 'neutre' }: InfoPastille) {
  return (
    <View
      style={[styles.pastille, ton === 'vert' && styles.pastilleVerte, ton === 'rouge' && styles.pastilleRouge]}
      accessible
      accessibilityLabel={`${libelle} : ${valeur}`}
    >
      <Text
        style={[styles.pastilleValeur, ton === 'vert' && styles.texteVert, ton === 'rouge' && styles.texteRouge]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {valeur}
      </Text>
      <Text style={styles.pastilleLibelle} numberOfLines={2}>
        {libelle}
      </Text>
    </View>
  );
}

const duree = (m: number | null) => (m === null || m <= 0 ? '—' : formatDuree(m));

export function DashboardScreen(props: Props) {
  const { tdb, tz, onFume, onResiste, onAnnuler, onPalier, onHistorique, onReglages, onSos, onSubstituts, onProgres, onSante, onCafe } = props;
  const obs = tdb.observation;
  const top = tdb.analyse.declencheurs[0];
  const heureRisque = tdb.analyse.heuresARisque[0];

  const statut =
    tdb.phase === 'observation'
      ? `Observation · ${obs?.joursMesures ?? 0}/${obs?.joursRequis ?? 3} jours`
      : tdb.phase === 'avant-debut'
        ? 'Prêt à démarrer'
        : `Jour ${(tdb.jourDuPlan ?? 0) + 1} du plan${tdb.dateDuZero && tdb.phase === 'reduction' ? ` · zéro le ${dateCourte(tdb.dateDuZero)}` : ''}`;

  const intervalleRef = tdb.respect.intervalleMinutes;
  const pastilles: InfoPastille[] = [
    {
      valeur: tdb.quota === null || tdb.phase === 'avant-debut' ? String(tdb.fumees) : `${tdb.fumees} / ${tdb.quota}`,
      // Le total réel inclut les cigarettes d'avant le démarrage du plan et celles sans heure (RM-13, import).
      libelle: tdb.quota === null ? 'fumées' : tdb.fumeesJournee > tdb.fumees ? `quota · ${tdb.fumeesJournee} au total` : 'fumées / quota',
    },
    // RM-18 : en vert les cigarettes qui ont respecté l'intervalle, en rouge les autres.
    // En observation, l'intervalle n'est qu'indicatif : pas de rouge pendant qu'on mesure.
    { valeur: String(tdb.respect.respectees), libelle: 'intervalle tenu', ton: 'vert' },
    {
      valeur: String(tdb.respect.nonRespectees),
      libelle: 'trop tôt',
      ton: tdb.respect.nonRespectees > 0 && tdb.phase !== 'observation' ? 'rouge' : 'neutre',
    },
    tdb.enviesSignalees > 0
      ? { valeur: `${tdb.enviesResistees} / ${tdb.enviesResistees + tdb.enviesSignalees}`, libelle: 'envies résistées / total' }
      : { valeur: String(tdb.enviesResistees), libelle: 'envies résistées' },
    tdb.phase === 'observation'
      ? { valeur: duree(tdb.depuisDerniereMinutes), libelle: 'depuis la dernière' }
      : { valeur: formatEuros(tdb.economieTotaleCents), libelle: 'économisés' },
    tdb.patch.statut === 'aucun'
      ? { valeur: '—', libelle: 'sans patch' }
      : tdb.patch.statut === 'a-retirer'
        ? { valeur: `${tdb.patch.dosageMg} mg`, libelle: 'patch à retirer', ton: 'rouge' }
        : { valeur: `${tdb.patch.dosageMg} mg`, libelle: `patch depuis ${heure(tdb.patch.poseLe, tz)}`, ton: 'vert' },
    // La moyenne du jour est affichée en direct sous le compteur : pas de case en double.
    ...(tdb.intervalleMoyen7jMinutes !== null ? [{ valeur: duree(tdb.intervalleMoyen7jMinutes), libelle: 'moyenne 7 jours' }] : []),
    { valeur: duree(tdb.plusLonguePauseMinutes), libelle: 'plus longue pause' },
    { valeur: duree(intervalleRef), libelle: 'recommandé' },
    {
      valeur: tdb.cafeine.quota !== null ? `${tdb.cafeine.aujourdhui.boissons} / ${tdb.cafeine.quota}` : String(tdb.cafeine.aujourdhui.boissons),
      libelle: tdb.cafeine.quota !== null ? 'cafés / palier' : 'cafés aujourd’hui',
      ton: tdb.cafeine.quota !== null && tdb.cafeine.aujourdhui.boissons > tdb.cafeine.quota ? 'rouge' : 'neutre',
    },
    { valeur: top ? `${Math.round(top.part * 100)} %` : '—', libelle: top ? top.libelle : 'déclencheur n° 1' },
    { valeur: heureRisque ? `${heureRisque.heure} h` : '—', libelle: 'heure à risque' },
  ];

  return (
    <SafeAreaView style={styles.page} edges={['top', 'bottom']}>
      {/* Tient sur une page ; ne défile que sur les petits écrans, sans jamais se chevaucher. */}
      <ScrollView contentContainerStyle={styles.defilement} showsVerticalScrollIndicator={false} bounces={false}>
      <View style={styles.entete}>
        <Text style={styles.marque}>Déclic</Text>
        <Text style={styles.statut} numberOfLines={1}>
          {statut}
        </Text>
      </View>

      <Rebours {...props} />

      {tdb.proposerPalier && (
        <Pressable style={styles.bandeau} onPress={onPalier} accessibilityRole="button">
          <Text style={styles.bandeauTexte}>Hier a été difficile · </Text>
          <Text style={styles.bandeauAction}>garder le même quota aujourd’hui</Text>
        </Pressable>
      )}

      {(tdb.phase === 'arret' || tdb.phase === 'maintien') && tdb.fumees > 0 && (
        <Pressable style={styles.bandeau} onPress={onProgres} accessibilityRole="button">
          <Text style={styles.bandeauTexte}>Un faux pas n’efface rien · </Text>
          <Text style={styles.bandeauAction}>en parler</Text>
        </Pressable>
      )}

      {tdb.patch.statut === 'a-retirer' && (
        <Pressable style={[styles.bandeau, styles.bandeauRouge]} onPress={onSubstituts} accessibilityRole="button">
          <Text style={[styles.bandeauTexte, styles.texteRouge]}>Ton patch est à retirer · </Text>
          <Text style={[styles.bandeauAction, styles.texteRouge]}>ouvrir</Text>
        </Pressable>
      )}

      <View style={styles.grille}>
        {pastilles.map((p) => (
          <Pastille key={p.libelle} {...p} />
        ))}
      </View>

      <View style={styles.actions}>
        <Pressable style={styles.bouton} onPress={onFume} accessibilityRole="button">
          <Text style={styles.boutonTexte}>J’ai fumé</Text>
        </Pressable>
        <View style={styles.ligneBoutons}>
          <Pressable style={[styles.bouton, styles.boutonSecondaire, styles.boutonDemi]} onPress={onSos} accessibilityRole="button">
            <Text style={[styles.boutonTexte, styles.boutonTexteSecondaire]}>SOS envie</Text>
          </Pressable>
          <Pressable style={[styles.bouton, styles.boutonSecondaire, styles.boutonDemi]} onPress={onResiste} accessibilityRole="button">
            <Text style={[styles.boutonTexte, styles.boutonTexteSecondaire]}>J’ai résisté</Text>
          </Pressable>
        </View>
        <Pressable style={styles.boutonCafe} onPress={onCafe} accessibilityRole="button" accessibilityLabel="J’ai bu un café">
          <Text style={styles.boutonCafeTexte}>☕ J’ai bu un café</Text>
        </Pressable>
        <View style={styles.liens}>
          <Pressable onPress={onAnnuler} accessibilityRole="button" hitSlop={8}>
            <Text style={styles.lien}>Annuler</Text>
          </Pressable>
          <Pressable onPress={onHistorique} accessibilityRole="button" hitSlop={8}>
            <Text style={styles.lien}>Historique</Text>
          </Pressable>
          <Pressable onPress={onProgres} accessibilityRole="button" hitSlop={8}>
            <Text style={styles.lien}>Progrès</Text>
          </Pressable>
          <Pressable onPress={onSubstituts} accessibilityRole="button" hitSlop={8}>
            <Text style={styles.lien}>{tdb.patch.statut === 'porte' ? 'Patch ●' : 'Substituts'}</Text>
          </Pressable>
          <Pressable onPress={onSante} accessibilityRole="button" hitSlop={8}>
            <Text style={styles.lien}>Santé</Text>
          </Pressable>
          <Pressable onPress={onReglages} accessibilityRole="button" hitSlop={8}>
            <Text style={styles.lien}>Réglages</Text>
          </Pressable>
        </View>
        <Text style={styles.mention}>
          {props.notificationsIndisponibles
            ? 'Notifications indisponibles : mets à jour Expo Go · Aide : 39 89'
            : 'Aide : Tabac Info Service 39 89 · Ne remplace pas un avis médical'}
        </Text>
      </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: couleurs.fond },
  defilement: { flexGrow: 1, paddingHorizontal: espace(4), justifyContent: 'space-between' },
  entete: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingTop: espace(2), paddingRight: espace(14) },
  marque: { color: couleurs.vert, fontSize: 15, fontWeight: '800', letterSpacing: 2, textTransform: 'uppercase' },
  statut: { color: couleurs.doux, fontSize: 15, fontWeight: '600', flexShrink: 1, marginLeft: espace(3) },

  hero: {
    backgroundColor: couleurs.vertClair,
    borderRadius: 22,
    paddingVertical: espace(3),
    paddingHorizontal: espace(4),
    marginTop: espace(2),
    alignItems: 'center',
  },
  heroPetit: { color: couleurs.vert, fontSize: 15, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center' },
  heroMoyenne: { color: couleurs.encre, fontSize: 16, textAlign: 'center', marginTop: espace(2) },
  heroMoyenneValeur: { fontWeight: '800', fontVariant: ['tabular-nums'] },
  heroAmbre: { backgroundColor: couleurs.ambreClair },
  texteAmbre: { color: couleurs.ambre },
  rebours: { color: couleurs.vert, fontSize: 56, fontWeight: '800', fontVariant: ['tabular-nums'] },
  heroTitre: { color: couleurs.encre, fontSize: 26, fontWeight: '800', marginTop: espace(1) },
  heroSous: { color: couleurs.doux, fontSize: 15, textAlign: 'center', lineHeight: 18 },
  heroBouton: { backgroundColor: couleurs.vert, borderRadius: 999, paddingHorizontal: espace(6), paddingVertical: espace(3), marginTop: espace(3) },
  heroBoutonTexte: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },

  bandeau: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', backgroundColor: couleurs.ambreClair, borderRadius: 999, paddingVertical: espace(2), paddingHorizontal: espace(4), marginTop: espace(2) },
  bandeauTexte: { color: couleurs.encre, fontSize: 15 },
  bandeauAction: { color: couleurs.ambre, fontSize: 15, fontWeight: '700', textDecorationLine: 'underline' },

  grille: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: espace(2), marginVertical: espace(3) },
  pastille: {
    width: '32%',
    minHeight: 58,
    backgroundColor: couleurs.carte,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: couleurs.ligne,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: espace(1),
    paddingVertical: espace(2),
  },
  pastilleVerte: { backgroundColor: couleurs.vertClair, borderColor: couleurs.vert },
  pastilleRouge: { backgroundColor: couleurs.rougeClair, borderColor: couleurs.rouge },
  texteVert: { color: couleurs.vert },
  texteRouge: { color: couleurs.rouge },
  pastilleValeur: { color: couleurs.encre, fontSize: 17, fontWeight: '800', fontVariant: ['tabular-nums'] },
  pastilleLibelle: { color: couleurs.doux, fontSize: 13, marginTop: 2, textAlign: 'center', lineHeight: 16 },

  actions: { paddingBottom: espace(1) },
  bouton: { backgroundColor: couleurs.vert, borderRadius: 16, paddingVertical: espace(4), alignItems: 'center' },
  boutonSecondaire: { backgroundColor: couleurs.carte, borderWidth: 2, borderColor: couleurs.vert },
  ligneBoutons: { flexDirection: 'row', gap: espace(2), marginTop: espace(2) },
  boutonDemi: { flex: 1 },
  boutonCafe: { marginTop: espace(2), paddingVertical: espace(2), alignItems: 'center', borderRadius: 14, borderWidth: 1, borderColor: couleurs.ligne, backgroundColor: couleurs.carte },
  boutonCafeTexte: { color: couleurs.encre, fontSize: 16, fontWeight: '700' },
  boutonTexte: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  boutonTexteSecondaire: { color: couleurs.vert },
  liens: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: espace(4), rowGap: espace(2), marginTop: espace(3) },
  bandeauRouge: { backgroundColor: couleurs.rougeClair },
  lien: { color: couleurs.doux, fontSize: 15, textDecorationLine: 'underline' },
  mention: { color: couleurs.doux, fontSize: 13, textAlign: 'center', marginTop: espace(2) },
});

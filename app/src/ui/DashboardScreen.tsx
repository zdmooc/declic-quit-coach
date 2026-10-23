import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { formatDuree, formatEuros, LIBELLES_CONTEXTE, type TableauDeBord } from '../domain';
import { couleurs, espace } from './theme';

interface Props {
  tdb: TableauDeBord;
  tz: string;
  onFume: () => void;
  onResiste: () => void;
  onAnnuler: () => void;
  onPalier: () => void;
  onDemarrerPlan: () => void;
  onEffacer: () => void;
}

const heure = (t: number, tz: string) =>
  new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: tz }).format(t);

const dateLongue = (jour: string) =>
  new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(
    Date.parse(`${jour}T12:00:00Z`),
  );

const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`;

function Observation({ tdb, onDemarrerPlan }: { tdb: TableauDeBord; onDemarrerPlan: () => void }) {
  const o = tdb.observation!;
  if (!o.terminee) {
    return (
      <View style={[styles.carte, styles.carteHero]}>
        <Text style={styles.petit}>Observation</Text>
        <Text style={styles.compteur}>
          {o.joursMesures} / {o.joursRequis}
        </Text>
        <Text style={styles.sous}>journées complètes mesurées</Text>
        <Text style={[styles.sous, styles.espaceHaut]}>
          Fume normalement et appuie sur « J’ai fumé » à chaque cigarette. Je calcule ensuite ton plan à partir de ta vraie
          journée.
        </Text>
        <Pressable onPress={onDemarrerPlan} accessibilityRole="button">
          <Text style={styles.lienTexte}>
            Démarrer tout de suite avec {o.proposition.referenceParJour} / jour (ma déclaration)
          </Text>
        </Pressable>
      </View>
    );
  }
  const h = o.habitudes!;
  const p = o.proposition;
  return (
    <View style={[styles.carte, styles.carteHero]}>
      <Text style={styles.petit}>Ton bilan d’observation</Text>
      <Text style={styles.grand}>≈ {pluriel(Math.round(h.cigarettesParJour), 'cigarette')} par jour</Text>
      <Text style={styles.sous}>
        de {h.debutHabituel} à {h.finHabituelle}
        {h.intervalleMoyenMinutes !== null ? ` · 1 toutes les ${formatDuree(h.intervalleMoyenMinutes)}` : ''}
      </Text>
      <Pressable style={[styles.bouton, styles.boutonDansCarte]} onPress={onDemarrerPlan} accessibilityRole="button">
        <Text style={styles.boutonTexte}>Démarrer mon plan</Text>
      </Pressable>
      <Text style={styles.sous}>
        Premier jour, {dateLongue(p.dateDebut)} : {pluriel(p.quotaDepart, 'cigarette')} maximum, puis une de moins chaque jour.
      </Text>
    </View>
  );
}

function Prochaine({ tdb, tz }: { tdb: TableauDeBord; tz: string }) {
  const p = tdb.prochaine;
  if (tdb.phase === 'avant-debut') {
    return (
      <>
        <Text style={styles.grand}>Ton plan démarre demain</Text>
        <Text style={styles.sous}>Ce soir, continue simplement à noter tes cigarettes.</Text>
      </>
    );
  }
  if (!p || p.statut === 'arret') {
    return (
      <>
        <Text style={styles.grand}>Journée sans tabac</Text>
        <Text style={styles.sous}>
          {tdb.depuisDerniereMinutes === null ? 'Aucune cigarette depuis le début.' : `${formatDuree(tdb.depuisDerniereMinutes)} sans fumer.`}
        </Text>
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
      <Text style={styles.grand}>{p.depuis === null ? 'Ta journée n’a pas commencé' : 'Tu peux fumer ta prochaine'}</Text>
      <Text style={styles.sous}>
        {p.depuis === null
          ? 'Ta première cigarette ouvrira la journée. Et si tu la repoussais un peu ?'
          : 'Ou tenter 10 minutes de plus : chaque minute compte.'}
      </Text>
    </>
  );
}

export function DashboardScreen({ tdb, tz, onFume, onResiste, onAnnuler, onPalier, onDemarrerPlan, onEffacer }: Props) {
  const enObservation = tdb.phase === 'observation';
  const titre = enObservation
    ? 'Observation'
    : tdb.phase === 'avant-debut'
      ? 'Prêt à démarrer'
      : `Jour ${(tdb.jourDuPlan ?? 0) + 1} du plan`;

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Text style={styles.marque}>Déclic</Text>
      <Text style={styles.titre}>{titre}</Text>
      {tdb.dateDuZero && tdb.phase === 'reduction' && <Text style={styles.texte}>Zéro cigarette prévu le {dateLongue(tdb.dateDuZero)}.</Text>}

      {tdb.proposerPalier && (
        <View style={styles.bandeau}>
          <Text style={styles.bandeauTexte}>Hier a été difficile. On garde le même quota aujourd’hui pour consolider ?</Text>
          <Pressable onPress={onPalier} accessibilityRole="button">
            <Text style={styles.bandeauAction}>Garder le même quota</Text>
          </Pressable>
        </View>
      )}

      {enObservation ? (
        <Observation tdb={tdb} onDemarrerPlan={onDemarrerPlan} />
      ) : (
        <View style={[styles.carte, styles.carteHero]}>
          <Prochaine tdb={tdb} tz={tz} />
        </View>
      )}

      <View style={styles.ligne}>
        <View style={[styles.carte, styles.demi]}>
          <Text style={styles.petit}>Aujourd’hui</Text>
          <Text style={styles.valeur}>{tdb.quota === null || tdb.phase === 'avant-debut' ? tdb.fumees : `${tdb.fumees} / ${tdb.quota}`}</Text>
          <Text style={styles.sous}>
            {tdb.intervalleCibleMinutes && tdb.phase === 'reduction'
              ? `objectif : 1 toutes les ${formatDuree(tdb.intervalleCibleMinutes)}`
              : enObservation
                ? 'cigarettes notées'
                : ' '}
          </Text>
        </View>
        <View style={[styles.carte, styles.demi]}>
          <Text style={styles.petit}>Envies résistées</Text>
          <Text style={styles.valeur}>{tdb.enviesResistees}</Text>
          <Text style={styles.sous}>aujourd’hui</Text>
        </View>
      </View>

      <View style={styles.carte}>
        <Text style={styles.petit}>Intervalle entre deux cigarettes</Text>
        <View style={styles.ligneStats}>
          <Stat valeur={tdb.intervalleMoyenJourMinutes} libelle="aujourd’hui" />
          <Stat valeur={tdb.intervalleMoyen7jMinutes} libelle="sur 7 jours" />
          <Stat valeur={tdb.plusLonguePauseMinutes} libelle="plus longue pause" />
        </View>
      </View>

      {tdb.analyse.avecContexte > 0 && (
        <View style={styles.carte}>
          <Text style={styles.petit}>Ce qui te donne envie</Text>
          {tdb.analyse.declencheurs.map((d) => (
            <View key={d.contexte} style={styles.declencheur}>
              <View style={styles.declencheurEntete}>
                <Text style={styles.declencheurLibelle}>{LIBELLES_CONTEXTE[d.contexte]}</Text>
                <Text style={styles.declencheurPart}>{Math.round(d.part * 100)} %</Text>
              </View>
              <View style={styles.barreFond}>
                <View style={[styles.barre, { width: `${Math.round(d.part * 100)}%` }]} />
              </View>
            </View>
          ))}
          {tdb.analyse.heuresARisque.length > 0 && (
            <Text style={[styles.sousGauche, styles.espaceHaut]}>
              Heures à risque : {tdb.analyse.heuresARisque.map((h) => `${h.heure} h`).join(', ')}
            </Text>
          )}
        </View>
      )}

      {!enObservation && (
        <View style={styles.carte}>
          <Text style={styles.petit}>Économisé</Text>
          <Text style={styles.valeur}>{formatEuros(tdb.economieTotaleCents)}</Text>
          <Text style={styles.sous}>
            dont {formatEuros(tdb.economieJourCents)} aujourd’hui · {formatEuros(tdb.projection.parAnCents)} par an après l’arrêt
          </Text>
        </View>
      )}

      <Pressable style={styles.bouton} onPress={onFume} accessibilityRole="button">
        <Text style={styles.boutonTexte}>J’ai fumé</Text>
      </Pressable>
      <Pressable style={[styles.bouton, styles.boutonSecondaire]} onPress={onResiste} accessibilityRole="button">
        <Text style={[styles.boutonTexte, styles.boutonTexteSecondaire]}>J’ai résisté à une envie</Text>
      </Pressable>
      <Pressable onPress={onAnnuler} accessibilityRole="button" style={styles.lien}>
        <Text style={styles.lienTexte}>Annuler la dernière saisie</Text>
      </Pressable>

      <Text style={styles.mention}>Besoin d’aide ? Tabac Info Service : 39 89. Déclic ne remplace pas un avis médical.</Text>
      <Pressable onPress={onEffacer} accessibilityRole="button" style={styles.lien}>
        <Text style={styles.effacer}>Effacer toutes mes données</Text>
      </Pressable>
    </ScrollView>
  );
}

function Stat({ valeur, libelle }: { valeur: number | null; libelle: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValeur}>{valeur === null || valeur === 0 ? '—' : formatDuree(valeur)}</Text>
      <Text style={styles.statLibelle}>{libelle}</Text>
    </View>
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
  carteHero: { backgroundColor: couleurs.vertClair, borderColor: couleurs.vertClair, alignItems: 'center', paddingVertical: espace(7) },
  ligne: { flexDirection: 'row', gap: espace(3) },
  demi: { flex: 1 },
  petit: { color: couleurs.doux, fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  compteur: { color: couleurs.vert, fontSize: 52, fontWeight: '800', marginVertical: espace(1), fontVariant: ['tabular-nums'] },
  grand: { color: couleurs.encre, fontSize: 24, fontWeight: '700', textAlign: 'center', marginTop: espace(1) },
  valeur: { color: couleurs.encre, fontSize: 30, fontWeight: '800', marginTop: espace(1), fontVariant: ['tabular-nums'] },
  sous: { color: couleurs.doux, fontSize: 14, marginTop: espace(1), textAlign: 'center', lineHeight: 20 },
  sousGauche: { color: couleurs.doux, fontSize: 14, lineHeight: 20 },
  espaceHaut: { marginTop: espace(3) },
  ligneStats: { flexDirection: 'row', marginTop: espace(3) },
  stat: { flex: 1, alignItems: 'center' },
  statValeur: { color: couleurs.encre, fontSize: 18, fontWeight: '700', fontVariant: ['tabular-nums'] },
  statLibelle: { color: couleurs.doux, fontSize: 12, marginTop: espace(1), textAlign: 'center' },
  declencheur: { marginTop: espace(3) },
  declencheurEntete: { flexDirection: 'row', justifyContent: 'space-between' },
  declencheurLibelle: { color: couleurs.encre, fontSize: 15, fontWeight: '600' },
  declencheurPart: { color: couleurs.doux, fontSize: 14, fontVariant: ['tabular-nums'] },
  barreFond: { height: 8, borderRadius: 4, backgroundColor: couleurs.vertClair, marginTop: espace(1), overflow: 'hidden' },
  barre: { height: 8, borderRadius: 4, backgroundColor: couleurs.vert },
  bandeau: { backgroundColor: couleurs.ambreClair, borderRadius: 14, padding: espace(4), marginTop: espace(4) },
  bandeauTexte: { color: couleurs.encre, fontSize: 15, lineHeight: 21 },
  bandeauAction: { color: couleurs.ambre, fontWeight: '700', marginTop: espace(2), fontSize: 15 },
  bouton: { backgroundColor: couleurs.vert, borderRadius: 16, paddingVertical: espace(5), alignItems: 'center', marginTop: espace(6), alignSelf: 'stretch' },
  boutonDansCarte: { marginTop: espace(4), marginBottom: espace(2), paddingVertical: espace(4) },
  boutonSecondaire: { backgroundColor: couleurs.carte, borderWidth: 2, borderColor: couleurs.vert, marginTop: espace(3) },
  boutonTexte: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  boutonTexteSecondaire: { color: couleurs.vert },
  lien: { alignItems: 'center', paddingVertical: espace(4) },
  lienTexte: { color: couleurs.doux, textDecorationLine: 'underline', fontSize: 14, textAlign: 'center', marginTop: espace(3) },
  mention: { color: couleurs.doux, fontSize: 13, textAlign: 'center', marginTop: espace(2) },
  effacer: { color: couleurs.doux, fontSize: 13, textDecorationLine: 'underline', marginBottom: espace(8) },
});

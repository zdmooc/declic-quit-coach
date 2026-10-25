/**
 * Tests de migration d'historique (ADR-0010) : conversion de la source, schéma v2 rétrocompatible,
 * rapprochement manuel, déduplication, changement d'heure, totaux réels et non-régression.
 *
 * Jeu SYNTHÉTIQUE de même structure que la source réelle (3 journées, dont une partielle, une avec
 * 5 heures inconnues, une en cours le jour du passage à l'heure d'hiver) : les données personnelles
 * de l'utilisateur ne sont pas versionnées dans ce dépôt public.
 */

import { randomFillSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { FakeClock, InMemoryEventStore, MemoryNotifier, UuidV7Generator } from '../adapters/memory';
import { rejouer, tableauDeBord, zonedInstant, type ContenuSante, type DomainEvent, type ReferencePharma } from '../domain';
import { Declic } from './declic';
import { analyserImport, convertirSource, idRapprochement, lireFichierDeclic, simulerImport, type Choix, type SourceMigration } from './migration';

const TZ = 'Europe/Paris';
const REF: ReferencePharma = { version: 't', validePar: null, valideLe: null, oraux: [] };
const SANTE: ContenuSante = { version: 't', validePar: null, jalons: [] };
const iso = (jour: string, hm: string) => new Date(zonedInstant(jour, hm, TZ)).toISOString();

let n = 0;
const app = (type: DomainEvent['type'], a: string, payload: object): DomainEvent =>
  ({ id: `app-${String(++n).padStart(3, '0')}`, type, schemaVersion: 1, occurredAt: a, tz: TZ, source: 'phone', payload }) as DomainEvent;

/** Saisies faites dans l'app : profil le jour 2, 2 cigarettes proches du journal, plan démarré le jour 3 à 15 h. */
function saisiesApp(): DomainEvent[] {
  n = 0;
  const c1 = app('CigaretteFumee', iso('2026-10-24', '19:40'), {});
  const c2 = app('CigaretteFumee', iso('2026-10-25', '11:15'), {});
  return [
    app('ProfilCree', iso('2026-10-24', '12:00'), { cigarettesParJour: 30, prixPaquetCents: 1300, cigarettesParPaquet: 20, dejaFumeAujourdhui: true }),
    c1,
    app('CigaretteCorrigee', iso('2026-10-24', '19:41'), { evenementId: c1.id, contexte: 'repas' }),
    c2,
    app('ConsentementModifie', iso('2026-10-25', '11:20'), { finalite: 'coach-ia', accorde: true }),
    app('PlanDemarre', iso('2026-10-25', '15:00'), {
      referenceParJour: 30, quotaDepart: 29, debutHabituel: '07:00', finHabituelle: '23:00', dateDebut: '2026-10-25', origine: 'declaration',
      strategie: { kind: 'pas', pas: 1, periodeJours: 1 },
    }),
  ];
}

const cig = (numero: number, jour: string, hm: string | null, precision = 'minute', contexte?: string) => ({
  numero,
  heure_locale: hm ? `${jour}T${hm}` : null,
  precision: hm ? precision : 'horaire absent',
  ...(hm ? { occurredAt_utc: iso(jour, hm) } : {}),
  ...(contexte ? { contexte } : {}),
});

function source(originaux: DomainEvent[]): SourceMigration {
  return {
    format: 'declic-historique-migration-source',
    version: 1,
    reference: { fuseau: TZ, derniereInformationSuiviLocale: '2026-10-25T17:00:00+01:00' },
    sauvegardeOriginaleDeclicV1: { format: 'declic-export', version: 1, events: originaux },
    historique: [
      {
        date: '2026-10-23',
        completude: 'partielle avant 16:00',
        totalCigarettesConfirmees: 8,
        cigarettes: [
          cig(1, '2026-10-23', '16:00'), cig(2, '2026-10-23', '16:30', 'environ'), cig(3, '2026-10-23', '17:20'),
          cig(4, '2026-10-23', '18:40', 'minute', 'cafe'), cig(5, '2026-10-23', '20:00', 'minute', 'travail'),
          cig(6, '2026-10-23', '21:10', 'environ', 'autre'), cig(7, '2026-10-23', '22:20'), cig(8, '2026-10-23', '23:50', 'environ', 'travail'),
        ],
        envies: { episodes_non_concretises_sur_le_moment: 3, episode_prolonge_abouti_a_cigarette: 1 },
        substituts: [{ type: 'PatchPose', heure_locale: '2026-10-23T16:00', dosageMg: 21, dureePortHeures: 24, precision: 'minute' }],
      },
      {
        date: '2026-10-24',
        completude: '11 cigarettes, 5 heures inconnues',
        totalCigarettesConfirmees: 11,
        cigarettes: [
          cig(1, '2026-10-24', '09:00'), cig(2, '2026-10-24', null), cig(3, '2026-10-24', null), cig(4, '2026-10-24', null),
          cig(5, '2026-10-24', null), cig(6, '2026-10-24', null), cig(7, '2026-10-24', '17:00'),
          cig(8, '2026-10-24', '18:20', 'minute', 'autre'), cig(9, '2026-10-24', '19:50', 'minute', 'repas'),
          cig(10, '2026-10-24', '21:30'), cig(11, '2026-10-24', '23:20'),
        ],
        envies: { signalements: 16, resistees_confirmees: null },
        substituts: [
          { type: 'PatchRetire', heure_locale: '2026-10-24T20:30', precision: 'environ' },
          { type: 'PatchPose', heure_locale: '2026-10-24T20:30', dosageMg: 21, dureePortHeures: 24, precision: 'environ' },
        ],
      },
      {
        date: '2026-10-25',
        completude: 'partielle, en cours à 17:00',
        totalCigarettesConfirmees: 11,
        cigarettes: [
          cig(1, '2026-10-25', '00:30', 'minute (CEST +02:00)'), cig(2, '2026-10-25', '10:40', 'minute', 'cafe'),
          cig(3, '2026-10-25', '11:40', 'minute', 'cafe'), cig(4, '2026-10-25', '12:40', 'minute', 'cafe'), cig(5, '2026-10-25', '13:50'),
          cig(6, '2026-10-25', '14:50', 'environ', 'repas'), cig(7, '2026-10-25', '15:30'), cig(8, '2026-10-25', '16:10', 'minute', 'cafe'),
          cig(9, '2026-10-25', '16:13'), cig(10, '2026-10-25', '16:45', 'minute', 'repas'), cig(11, '2026-10-25', '17:00', 'minute', 'stress'),
        ],
        envies: { signalements_minimum: 3, devenues_cigarettes: 2, resistees_confirmees: null },
        substituts: [],
      },
    ],
  };
}

/** Rapprochement « même cigarette, heure du journal » pour chaque saisie de l'app, sur le candidat le plus proche. */
const toutRapprocher = (divs: { appId: string; candidats: { id: string }[] }[]): Choix =>
  Object.fromEntries(divs.map((d) => [d.appId, { action: 'meme' as const, journalId: d.candidats[0]!.id, garder: 'journal' as const }]));

function monter(evs: DomainEvent[]) {
  const clock = new FakeClock(zonedInstant('2026-10-25', '17:05', TZ), TZ);
  const store = new InMemoryEventStore();
  const ids = new UuidV7Generator((b) => randomFillSync(b), () => clock.now());
  const declic = new Declic({ store, clock, ids, notifier: new MemoryNotifier(), referencePharma: REF, contenuSante: SANTE });
  return { declic, store, clock, charger: async () => { for (const e of evs) await store.append(e); } };
}

describe('conversion de la source de préparation (schéma v2)', () => {
  const originaux = saisiesApp();
  const f = convertirSource(source(originaux));

  it('8, 6 + 5 sans heure, 11 : aucune heure inventée', () => {
    const cigs = f.events.filter((e) => e.type === 'CigaretteFumee' && e.source === 'import');
    const parJour = (j: string) => cigs.filter((e) => e.type === 'CigaretteFumee' && e.payload.journee === j).length;
    expect([parJour('2026-10-23'), parJour('2026-10-24'), parJour('2026-10-25')]).toEqual([8, 6, 11]);
    const agregat = f.events.find((e) => e.type === 'AgregatSansHeure' && e.payload.nature === 'cigarettes');
    expect(agregat).toMatchObject({ payload: { journee: '2026-10-24', nombre: 5 } });
    expect(f.meta?.attendu).toMatchObject({ '2026-10-23': { cigarettes: 8, partielle: 'partielle avant 16:00' }, '2026-10-25': { cigarettes: 11, enCours: true } });
  });

  it('précision exacte / approximative / inconnue', () => {
    const precis = f.events.flatMap((e) => (e.type === 'CigaretteFumee' && e.source === 'import' ? [e.payload.precision ?? 'exacte'] : []));
    expect(precis.filter((p) => p === 'approximative')).toHaveLength(4);
    expect(precis.filter((p) => p === 'exacte')).toHaveLength(21);
  });

  it('changement d’heure : 00 h 30 en UTC+2, 10 h 40 en UTC+1', () => {
    const h = (id: string) => f.events.find((e) => e.id === id)!.occurredAt;
    expect(h('src-2026-10-25-c01')).toBe('2026-10-24T22:30:00.000Z');
    expect(h('src-2026-10-25-c02')).toBe('2026-10-25T09:40:00.000Z');
  });

  it('heure UTC incohérente avec l’heure locale : refus explicite', () => {
    const s = source(originaux);
    s.historique[2]!.cigarettes[0]!.occurredAt_utc = '2026-10-24T23:30:00Z'; // décalage d'hiver appliqué à tort
    expect(() => convertirSource(s)).toThrow(/ne correspond pas/);
  });

  it('envies : comptes séparés, jamais convertis en envies résistées', () => {
    expect(f.events.some((e) => e.type === 'EnvieResistee')).toBe(false);
    const envies = f.events.filter((e) => e.type === 'AgregatSansHeure' && e.payload.nature === 'envies-signalees');
    expect(envies.map((e) => e.type === 'AgregatSansHeure' && [e.payload.journee, e.payload.nombre, e.payload.auMoins ?? false])).toEqual([
      ['2026-10-23', 4, false],
      ['2026-10-24', 16, false],
      ['2026-10-25', 3, true],
    ]);
  });

  it('format v1 toujours lisible ; types v2 refusés dans un fichier v1', () => {
    const v1 = JSON.stringify({ format: 'declic-export', version: 1, events: originaux });
    expect(lireFichierDeclic(v1).events).toHaveLength(originaux.length);
    const faux = JSON.stringify({ format: 'declic-export', version: 1, events: [...originaux, f.events.find((e) => e.type === 'AgregatSansHeure')] });
    expect(() => lireFichierDeclic(faux)).toThrow(/réservé au format v2/);
    const v2 = JSON.stringify({ format: 'declic-export', version: 2, meta: f.meta, events: f.events });
    expect(lireFichierDeclic(v2)).toMatchObject({ version: 2, meta: { type: 'migration' } });
  });
});

describe('aperçu, rapprochement manuel et fusion', () => {
  it('aperçu sans écriture, 2 divergences à trancher, import bloqué tant qu’elles ne le sont pas', async () => {
    const evs = saisiesApp();
    const { declic, store, charger } = monter(evs);
    await charger();
    const texte = JSON.stringify(source(evs));
    const apercu = await declic.apercuImport(texte);
    expect(await store.all()).toHaveLength(evs.length); // rien n'est écrit
    expect(apercu.divergences.map((d) => d.candidats[0]!.id)).toEqual(['src-2026-10-24-c09', 'src-2026-10-25-c03']);
    await expect(declic.confirmerImport(apercu, {})).rejects.toThrow(/2 rapprochement/);
    const sansDecision = await declic.simulerImport(apercu, {});
    expect(sansDecision.jours.map((j) => j.apres)).toEqual([8, 12, 12]); // distinctes par défaut dans les totaux
  });

  it('fusion : 8 / 11 / 11, saisies existantes intactes, total réel avant le plan, DST et patchs', async () => {
    const evs = saisiesApp();
    const { declic, store, charger } = monter(evs);
    await charger();
    const apercu = await declic.apercuImport(JSON.stringify(source(evs)));
    const choix = toutRapprocher(apercu.divergences);
    const sim = await declic.simulerImport(apercu, choix);
    expect(sim.jours.map((j) => [j.jour, j.apres, j.sansHeure])).toEqual([
      ['2026-10-23', 8, 0],
      ['2026-10-24', 11, 5],
      ['2026-10-25', 11, 0],
    ]);
    expect(sim.anomalies.join(' ')).toMatch(/avant le démarrage du plan/);
    expect(apercu.anomalies.join(' ')).toMatch(/changement d’heure \(UTC\+2 puis UTC\+1\)/);
    expect(apercu.anomalies.join(' ')).toMatch(/23\/10 : journée partielle/);

    await declic.confirmerImport(apercu, choix);
    const apres = await store.all();
    // Préservation : chaque saisie d'origine est encore là, à l'identique.
    for (const e of evs) expect(apres.find((x) => x.id === e.id)).toEqual(e);
    // Rapprochement = correction ajoutée (heure du journal), jamais d'écrasement.
    const corr = apres.find((e) => e.id === idRapprochement('src-2026-10-24-c09'));
    expect(corr).toMatchObject({ type: 'CigaretteCorrigee', payload: { evenementId: evs[1]!.id, occurredAt: iso('2026-10-24', '19:50') } });

    const tdb = (await declic.tableauDeBord())!;
    expect(tdb.fumeesJournee).toBe(11); // total réel du 25, avant-plan compris
    expect(tdb.fumees).toBe(5); // comptées pour le quota : après 15 h
    expect(tdb.enviesSignalees).toBe(3);
    expect(tdb.enviesResistees).toBe(0);
    // Patch posé le 24 à 20 h 30 (UTC+2) : 24 h réelles plus tard = 19 h 30 le 25 (UTC+1).
    expect(tdb.patch).toMatchObject({ statut: 'porte', retraitPrevu: zonedInstant('2026-10-25', '19:30', TZ) });
    const hist = await declic.historique(5);
    expect(hist.find((j) => j.jour === '2026-10-24')).toMatchObject({ total: 11, sansHeure: 5, enviesSignalees: 16 });
    // Les cigarettes sans heure ne créent ni intervalle ni heure à risque.
    expect(hist.find((j) => j.jour === '2026-10-24')!.cigarettes).toHaveLength(6);
  });

  it('idempotence : réimporter le même fichier n’ajoute rien et ne repose aucune question', async () => {
    const evs = saisiesApp();
    const { declic, store, charger } = monter(evs);
    await charger();
    const texte = JSON.stringify(source(evs));
    const a1 = await declic.apercuImport(texte);
    await declic.confirmerImport(a1, toutRapprocher(a1.divergences));
    const avant = (await store.all()).length;
    const a2 = await declic.apercuImport(texte);
    expect(a2.aAjouter).toHaveLength(0);
    expect(a2.divergences).toHaveLength(0);
    expect(a2.anomalies[0]).toMatch(/déjà été importé/);
    expect(await declic.confirmerImport(a2, {})).toBe(0);
    expect(await store.all()).toHaveLength(avant);
  });

  it('cigarettes distinctes : les deux sont gardées et l’écart avec la source est signalé', () => {
    const evs = saisiesApp();
    const apercu = analyserImport(evs, convertirSource(source(evs)), TZ);
    const choix: Choix = Object.fromEntries(apercu.divergences.map((d) => [d.appId, { action: 'distinctes' as const }]));
    const sim = simulerImport(evs, apercu, choix, TZ);
    expect(sim.jours.map((j) => j.apres)).toEqual([8, 12, 12]);
    expect(sim.anomalies.join(' ')).toMatch(/24\/10 : 12 cigarettes avec ces choix, la source en annonce 11/);
  });

  it('choix incohérent (même cigarette du journal pour deux saisies) : refusé', () => {
    const evs = saisiesApp();
    const apercu = analyserImport(evs, convertirSource(source(evs)), TZ);
    const j = apercu.divergences[0]!.candidats[0]!.id;
    const choix: Choix = Object.fromEntries(apercu.divergences.map((d) => [d.appId, { action: 'meme' as const, journalId: j, garder: 'app' as const }]));
    expect(simulerImport(evs, apercu, choix, TZ).erreurs.length).toBeGreaterThan(0);
  });

  it('journal modifié entre l’aperçu et la confirmation : refus, rien n’est écrit', async () => {
    const evs = saisiesApp();
    const { declic, store, charger } = monter(evs);
    await charger();
    const apercu = await declic.apercuImport(JSON.stringify(source(evs)));
    await declic.enregistrerCigarette();
    const n0 = (await store.all()).length;
    await expect(declic.confirmerImport(apercu, toutRapprocher(apercu.divergences))).rejects.toThrow(/relance l’aperçu/);
    expect(await store.all()).toHaveLength(n0);
  });

  it('nouveau téléphone : les saisies d’origine du fichier sont reprises, puis fusion', () => {
    const evs = saisiesApp();
    const apercu = analyserImport([], convertirSource(source(evs)), TZ);
    expect(apercu.bloquant).toBeNull();
    expect(apercu.divergences).toHaveLength(2);
    const sim = simulerImport([], apercu, toutRapprocher(apercu.divergences), TZ);
    expect(sim.jours.map((j) => j.apres)).toEqual([8, 11, 11]);
    expect(rejouer(sim.evenements, TZ)?.plan?.reference).toBe(30);
  });
});

describe('non-régression', () => {
  it('une journée sans import garde ses compteurs ; l’export est en v2 et se restaure', async () => {
    const evs = saisiesApp();
    const { declic, charger } = monter(evs);
    await charger();
    const tdb = tableauDeBord(rejouer(evs, TZ)!, zonedInstant('2026-10-25', '17:05', TZ), TZ, REF);
    expect([tdb.fumees, tdb.fumeesJournee, tdb.enviesSignalees]).toEqual([0, 1, 0]);
    const exporte = JSON.parse(await declic.exporterDonnees()) as { version: number };
    expect(exporte.version).toBe(2);
    const autre = monter([]);
    await autre.declic.importerDonnees(await declic.exporterDonnees());
    expect(await autre.store.all()).toEqual(evs);
  });
});

import { describe, expect, it } from 'vitest';
import { randomFillSync } from 'node:crypto';
import { zonedInstant, type ContenuSante, type ReferencePharma } from '../domain';
import { FakeClock, InMemoryEventStore, MemoryNotifier, UuidV7Generator } from '../adapters/memory';
import { Declic } from './declic';

const TZ = 'Europe/Paris';
const REF: ReferencePharma = { version: 't', validePar: null, valideLe: null, oraux: [] };
const SANTE: ContenuSante = { version: 't', validePar: null, jalons: [] };
const PROFIL = { cigarettesParJour: 20, prixPaquetCents: 1300, cigarettesParPaquet: 20, dejaFumeAujourdhui: false };

function monter(debut = zonedInstant('2026-11-02', '06:30', TZ)) {
  const clock = new FakeClock(debut, TZ);
  const store = new InMemoryEventStore();
  const notifier = new MemoryNotifier();
  const ids = new UuidV7Generator((b) => randomFillSync(b), () => clock.now());
  const app = new Declic({ store, clock, ids, notifier, referencePharma: REF, contenuSante: SANTE });
  return { app, clock, store, notifier };
}

/** Simule une journée : `n` cigarettes à partir de l'heure courante, toutes les `ecart` minutes. */
async function journee(app: Declic, clock: FakeClock, n: number, ecart: number) {
  for (let i = 0; i < n; i++) {
    await app.enregistrerCigarette(i % 2 === 0 ? 'cafe' : 'stress');
    if (i < n - 1) clock.avancerMinutes(ecart);
  }
}

describe('Declic (cas d\'usage)', () => {
  it('sans profil, pas de tableau de bord', async () => {
    const { app } = monter();
    expect(await app.aUnProfil()).toBe(false);
    expect(await app.tableauDeBord()).toBeNull();
    expect(await app.replanifierNotifications()).toEqual([]);
  });

  it('parcours complet : observation 3 jours, bilan, plan mesuré, réduction', async () => {
    const { app, clock, notifier } = monter();
    await app.creerProfil(PROFIL);
    expect((await app.tableauDeBord())!.phase).toBe('observation');

    // 3 journées de 15 cigarettes, de 7 h 30 à 21 h 30 (une toutes les 60 min).
    for (let j = 0; j < 3; j++) {
      clock.avancerMinutes(j === 0 ? 60 : 10 * 60); // 7 h 30 le 1er jour ; puis 21 h 30 → 7 h 30
      await journee(app, clock, 15, 60);
    }
    clock.avancerMinutes(9 * 60); // lendemain 6 h 30, avant la 1re cigarette
    let tdb = (await app.tableauDeBord())!;
    expect(tdb.observation).toMatchObject({
      terminee: true,
      proposition: { referenceParJour: 15, quotaDepart: 14, debutHabituel: '07:30', finHabituelle: '21:30', dateDebut: '2026-11-05' },
    });
    expect(tdb.analyse.declencheurs[0]!.contexte).toBe('cafe');
    expect(notifier.planifiees).toEqual([]); // replanifié à la dernière saisie, avant la fin de l'observation

    await app.demarrerPlan();
    await app.demarrerPlan(); // idempotent : un seul plan
    tdb = (await app.tableauDeBord())!;
    expect(tdb).toMatchObject({ phase: 'reduction', jourDuPlan: 0, quota: 14 });
    expect(tdb.intervalleCibleMinutes).toBeCloseTo((14 * 60) / 13);
    expect(notifier.planifiees.some((n) => n.cle === 'plan-2026-11-05')).toBe(true);

    clock.avancerMinutes(60);
    const id = await app.enregistrerCigarette();
    await app.preciserCigarette(id, { contexte: 'repas' });
    tdb = (await app.tableauDeBord())!;
    expect(tdb.fumees).toBe(1);
    expect(tdb.prochaine?.statut).toBe('attendre');
    expect(notifier.planifiees.some((n) => n.categorie === 'rythme')).toBe(true);
  });

  it('démarrage immédiat sans observation, à partir de la consommation déclarée', async () => {
    const { app, clock } = monter(zonedInstant('2026-11-02', '18:00', TZ));
    await app.creerProfil({ ...PROFIL, dejaFumeAujourdhui: true });
    await app.demarrerPlan();
    clock.avancerMinutes(30);
    const tdb = (await app.tableauDeBord())!;
    expect(tdb).toMatchObject({ phase: 'reduction', quota: 19, jourDuPlan: 0 });
  });

  it('préciser l\'heure : « il y a 20 min »', async () => {
    const { app, clock } = monter();
    await app.creerProfil(PROFIL);
    clock.avancerMinutes(120);
    const id = await app.enregistrerCigarette();
    await app.preciserCigarette(id, { ilYaMinutes: 20 });
    await app.preciserCigarette(id, {}); // sans effet
    const tdb = (await app.tableauDeBord())!;
    expect(tdb.depuisDerniereMinutes).toBe(20);
  });

  it('annulation, palier, substituts, objectif, saisie depuis la montre', async () => {
    const { app, clock, store } = monter();
    expect(await app.annulerDerniereSaisie()).toBe(false);
    await app.demanderPalier(); // sans profil : sans effet
    await app.creerProfil({ ...PROFIL, cigarettesParJour: 3 });
    await app.demanderPalier(); // pendant l'observation : sans effet
    await app.demarrerPlan(); // immédiat : quota 2 dès aujourd'hui
    clock.avancerMinutes(60);
    await journee(app, clock, 4, 30);
    expect(await app.annulerDerniereSaisie()).toBe(true);
    expect((await app.tableauDeBord())!.fumees).toBe(3);

    clock.avancerMinutes(24 * 60);
    let tdb = (await app.tableauDeBord())!;
    expect(tdb).toMatchObject({ quota: 1, proposerPalier: true });
    await app.demanderPalier();
    tdb = (await app.tableauDeBord())!;
    expect(tdb).toMatchObject({ quota: 2, proposerPalier: false });

    await app.poserPatch(1, 16);
    await app.retirerPatch();
    await app.prendreSubstitutOral('pastille', 1);
    await app.definirObjectif('Vélo', 40000);
    await app.enregistrerEnvieResistee('respiration');
    await app.enregistrerCigarette('stress', 'watch');
    tdb = (await app.tableauDeBord())!;
    expect(tdb.patch.statut).toBe('aucun');
    expect(tdb.oraux.find((o) => o.forme === 'pastille')?.prisesAujourdhui).toBe(1);
    expect(tdb.oraux.find((o) => o.forme === 'pastille')?.dernierDosageMg).toBe(1);
    expect(tdb.oraux.find((o) => o.forme === 'pastille')?.derniereA).not.toBeNull();
    expect(tdb.oraux.find((o) => o.forme === 'gomme')?.derniereA).toBeNull();
    expect(tdb.objectifs).toHaveLength(1);
    expect(tdb.enviesResistees).toBe(1);
    expect((await store.all()).at(-1)?.source).toBe('watch');
    await expect(app.definirObjectif('Rien', 0)).rejects.toThrow(/invalide/);
  });

  it('les identifiants UUID v7 sont uniques et ordonnés', () => {
    let t = 1_700_000_000_000;
    const gen = new UuidV7Generator((b) => randomFillSync(b), () => t++);
    const ids = Array.from({ length: 200 }, () => gen.next());
    expect(new Set(ids).size).toBe(200);
    expect([...ids].sort()).toEqual(ids);
    expect(ids[0]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe('suppression des données', () => {
  it('efface tout et revient à l\'écran de départ', async () => {
    const { app, notifier } = monter();
    await app.creerProfil(PROFIL);
    await app.demarrerPlan();
    expect(notifier.planifiees.length).toBeGreaterThan(0);
    await app.effacerToutesLesDonnees();
    expect(await app.aUnProfil()).toBe(false);
    expect(notifier.planifiees).toEqual([]);
  });
});

describe('contextes personnels', () => {
  it('ajoute un contexte, le réutilise, reconnaît un libellé prédéfini, refuse un libellé vide', async () => {
    const { app } = monter();
    await app.creerProfil(PROFIL);
    const cle = await app.ajouterContexte('  Au   volant ');
    expect(cle).toMatch(/^perso:/);
    expect(await app.ajouterContexte('au volant')).toBe(cle);
    expect(await app.ajouterContexte('Café')).toBe('cafe');
    const id = await app.enregistrerCigarette();
    await app.preciserCigarette(id, { contexte: cle });
    const tdb = (await app.tableauDeBord())!;
    expect(tdb.contextesPerso).toEqual([{ cle, libelle: 'Au volant' }]);
    expect(tdb.analyse.declencheurs[0]!.libelle).toBe('Au volant');
    await expect(app.ajouterContexte('   ')).rejects.toThrow(/invalide/);
  });
});

describe('SOS envie', () => {
  it('raisons d\'arrêter et envie résistée par respiration', async () => {
    const { app, store } = monter();
    await app.creerProfil(PROFIL);
    await app.ajouterRaison('  Pour courir avec mes enfants ');
    await expect(app.ajouterRaison(' ')).rejects.toThrow(/invalide/);
    await app.enregistrerEnvieResistee('respiration');
    const tdb = (await app.tableauDeBord())!;
    expect(tdb.raisons).toEqual(['Pour courir avec mes enfants']);
    expect(tdb.enviesResistees).toBe(1);
    expect((await store.all()).at(-1)).toMatchObject({ type: 'EnvieResistee', payload: { strategieUtilisee: 'respiration' } });
  });
});

describe('historique et réglages', () => {
  it('historique : journées, respect de l\'intervalle, contexte ; suppression d\'une saisie', async () => {
    const { app, clock } = monter();
    await app.creerProfil(PROFIL);
    clock.avancerMinutes(60); // 7 h 30
    const premiere = await app.enregistrerCigarette('cafe');
    clock.avancerMinutes(30);
    const deuxieme = await app.enregistrerCigarette();
    clock.avancerMinutes(70);
    await app.enregistrerCigarette('stress');
    let h = await app.historique();
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ jour: '2026-11-02', enPlan: false, fumees: 3, quota: null, intervalleMinutes: 60, respectees: 1, nonRespectees: 1 });
    expect(h[0]!.cigarettes.map((c) => c.respectee)).toEqual([null, false, true]);
    expect(h[0]!.cigarettes[0]).toMatchObject({ id: premiere, libelleContexte: 'Café' });

    await app.annulerSaisie(deuxieme);
    h = await app.historique();
    expect(h[0]).toMatchObject({ fumees: 2, respectees: 1, nonRespectees: 0 });
  });

  it('réglages : prix, intervalle recommandé, rythme, contextes perso, export', async () => {
    const { app, clock } = monter();
    await app.creerProfil(PROFIL);
    let r = (await app.reglages())!;
    expect(r).toMatchObject({ prixPaquetCents: 1300, cigarettesParPaquet: 20, intervalleRecommande: 60, planDemarre: false, strategie: null });

    await app.modifierPrix(1400, 20);
    await app.modifierIntervalleRecommande(45);
    await expect(app.modifierIntervalleRecommande(5)).rejects.toThrow(/invalide/);
    clock.avancerMinutes(60);
    await app.enregistrerCigarette();
    let tdb = (await app.tableauDeBord())!;
    expect(tdb.prochaine).toMatchObject({ statut: 'attendre', resteMinutes: 45 });

    const cle = (await app.ajouterContexte('Au volant')) as `perso:${string}`;
    await app.renommerContexte(cle, 'En voiture');
    r = (await app.reglages())!;
    expect(r).toMatchObject({ prixPaquetCents: 1400, intervalleRecommande: 45, contextesPerso: [{ cle, libelle: 'En voiture' }] });
    await app.archiverContexte(cle);
    expect((await app.reglages())!.contextesPerso).toEqual([]);
    expect((await app.tableauDeBord())!.contextesPerso).toEqual([]);

    await app.modifierRythme({ kind: 'pas', pas: 1, periodeJours: 7 }); // sans plan : sans effet
    await app.demarrerPlan();
    await app.modifierRythme({ kind: 'pas', pas: 1, periodeJours: 7 });
    expect((await app.reglages())!.strategie).toEqual({ kind: 'pas', pas: 1, periodeJours: 7 });
    tdb = (await app.tableauDeBord())!;
    expect(tdb.phase).toBe('reduction');

    const exp = JSON.parse(await app.exporterDonnees()) as { format: string; events: unknown[] };
    expect(exp.format).toBe('declic-export');
    expect(exp.events.length).toBeGreaterThan(5);
  });
});

describe('coach IA (F7.2, F7.5, F7.6)', () => {
  it('garde-fous avant tout envoi, consentement obligatoire, résumé seulement', async () => {
    const { app } = monter();
    await app.creerProfil(PROFIL);
    const recues: unknown[] = [];
    app.brancherCoach({
      repondre: async (r) => {
        recues.push(r);
        return 'Respire avec moi.';
      },
    });

    // Garde-fou : réponse fixe, l'IA n'est pas appelée (même sans consentement).
    const g = await app.parlerAuCoach('sos', [{ role: 'user', texte: 'Combien de pastilles je peux prendre ?' }]);
    expect(g.garde).toBe(true);
    expect(recues).toHaveLength(0);

    // Sans consentement : refus.
    expect(await app.coachIaDisponible()).toBe(false);
    await expect(app.parlerAuCoach('sos', [{ role: 'user', texte: 'J’ai très envie' }])).rejects.toThrow(/non activé/);

    await app.consentirCoachIa(true);
    expect(await app.coachIaDisponible()).toBe(true);
    const r = await app.parlerAuCoach('sos', [{ role: 'user', texte: 'J’ai très envie' }]);
    expect(r).toEqual({ texte: 'Respire avec moi.', garde: false });
    expect(recues[0]).toMatchObject({ mode: 'sos', resume: { phase: 'observation' } });

    expect((await app.motDuCoach())?.titre).toBe('Ta journée d’observation');
    await app.definirObjectif(' Vélo ', 40000);
    expect((await app.tableauDeBord())!.objectifs).toEqual([{ libelle: 'Vélo', montantCents: 40000, joursRestants: null }]);
    await app.retirerObjectif('Vélo');
    expect((await app.tableauDeBord())!.objectifs).toEqual([]);
    expect((await app.progres())!.records.joursSansTabac).toBe(0);
  });
});

describe('adresse du relais', () => {
  it('retire le point final ajouté par le clavier, les espaces et les barres', async () => {
    const { normaliserUrlCoach } = await import('../adapters/coachHttp');
    expect(normaliserUrlCoach(' https://declic-coach.zdmooc.workers.dev. ')).toBe('https://declic-coach.zdmooc.workers.dev');
    expect(normaliserUrlCoach('https://declic-coach.zdmooc.workers.dev/')).toBe('https://declic-coach.zdmooc.workers.dev');
    expect(normaliserUrlCoach('http://x.workers.dev')).toBe('https://x.workers.dev');
  });
});

describe('sauvegarde et restauration (F9.1)', () => {
  it('export puis import sur un téléphone neuf : tableau de bord identique', async () => {
    const a = monter();
    await a.app.creerProfil(PROFIL);
    a.clock.avancerMinutes(60);
    await journee(a.app, a.clock, 5, 60);
    await a.app.definirObjectif('Vélo', 40000);
    const sauvegarde = await a.app.exporterDonnees();

    const b = monter(a.clock.now());
    expect(await b.app.importerDonnees(sauvegarde)).toEqual({ evenements: 7, journees: 1 });
    expect(await b.app.tableauDeBord()).toEqual(await a.app.tableauDeBord());
    expect(await b.store.all()).toEqual(await a.store.all());
  });

  it('fichier invalide : rien n\'est effacé', async () => {
    const { app } = monter();
    await app.creerProfil(PROFIL);
    await expect(app.importerDonnees('pas du json')).rejects.toThrow(/JSON illisible/);
    await expect(app.importerDonnees('{"format":"autre","events":[]}')).rejects.toThrow(/pas une sauvegarde/);
    await expect(app.importerDonnees('{"format":"declic-export","version":1,"events":[]}')).rejects.toThrow(/sans profil/);
    await expect(app.importerDonnees('{"format":"declic-export","version":1,"events":[{"type":"Inconnu","payload":{}}]}')).rejects.toThrow(/n° 1 invalide/);
    expect(await app.aUnProfil()).toBe(true);
  });
});

describe('descente par paliers libres', () => {
  it('palier choisi dès aujourd’hui, jamais au-dessus du palier en cours, puis −1 quand on le décide', async () => {
    const { app, clock } = monter();
    await app.creerProfil({ ...PROFIL, cigarettesParJour: 40 });
    await app.demarrerPlan(); // démarrage immédiat sur la déclaration : quota 39
    expect((await app.tableauDeBord())!.quota).toBeGreaterThan(20);

    await app.fixerPalier(20);
    expect((await app.tableauDeBord())!.quota).toBe(20);
    await expect(app.fixerPalier(25)).rejects.toThrow(/sous le palier actuel \(20\)/);
    await expect(app.fixerPalier(20)).rejects.toThrow(/sous le palier actuel/);

    // Paliers libres : pas de baisse automatique les jours suivants.
    clock.avancerMinutes(24 * 60);
    expect((await app.tableauDeBord())!.quota).toBe(20);
    clock.avancerMinutes(24 * 60);
    await app.fixerPalier(13);
    expect((await app.tableauDeBord())!.quota).toBe(13);

    // Puis on passe à −1 par jour à partir de demain.
    await app.modifierRythme({ kind: 'pas', pas: 1, periodeJours: 1 });
    clock.avancerMinutes(24 * 60);
    expect((await app.tableauDeBord())!.quota).toBe(13); // jour du changement de rythme : inchangé
    clock.avancerMinutes(24 * 60);
    expect((await app.tableauDeBord())!.quota).toBe(12);
  });

  it('patchs par journée : avec ou sans, dosage, pose et renouvellement prévu', async () => {
    const { app, clock } = monter();
    await app.creerProfil(PROFIL);
    clock.avancerMinutes(60);
    await app.poserPatch(21, 24);
    const pose = clock.now();
    clock.avancerMinutes(26 * 60);
    await app.retirerPatch();
    const retrait = clock.now();
    const [j2, j1] = await app.historique(5);
    expect(j1!.patchs).toEqual([{ dosageMg: 21, poseA: pose, renouvellementPrevu: pose + 24 * 3_600_000, retireA: retrait }]);
    expect(j2!.patchs).toHaveLength(1); // porté jusqu'au retrait du lendemain
  });
});

describe('correction de l’heure après coup', () => {
  it('4 saisies d’un coup puis heures réelles : intervalles recalculés, futur refusé', async () => {
    const { app, clock } = monter(zonedInstant('2026-10-26', '10:00', TZ));
    await app.creerProfil(PROFIL);
    const ids = [await app.enregistrerCigarette(), await app.enregistrerCigarette(), await app.enregistrerCigarette(), await app.enregistrerCigarette()];
    expect((await app.tableauDeBord())!.respect.nonRespectees).toBe(3);
    for (const [i, h] of ['07:40', '08:30', '09:10', '09:55'].entries()) await app.corrigerHeure(ids[i]!, h);
    const tdb = (await app.tableauDeBord())!;
    expect(tdb.fumees).toBe(4);
    expect(tdb.intervalleMoyenJourMinutes).toBeCloseTo((50 + 40 + 45) / 3);
    await expect(app.corrigerHeure(ids[0]!, '25:00')).rejects.toThrow(/invalide/);
    clock.avancerMinutes(0);
    const [j] = await app.historique(1);
    expect(j!.cigarettes.map((c) => c.a)).toEqual(['07:40', '08:30', '09:10', '09:55'].map((h) => zonedInstant('2026-10-26', h, TZ)));
  });
});

describe('patch déclaré après coup', () => {
  it('pose antidatée : on sait quelles cigarettes ont été fumées avec ou sans patch', async () => {
    const { app } = monter(zonedInstant('2026-10-26', '10:30', TZ));
    await app.creerProfil(PROFIL);
    const ids = [await app.enregistrerCigarette(), await app.enregistrerCigarette(), await app.enregistrerCigarette()];
    for (const [i, h] of ['07:00', '08:30', '10:00'].entries()) await app.corrigerHeure(ids[i]!, h);
    await app.poserPatch(21, 24, '08:00');
    const [j] = await app.historique(1);
    expect(j!.cigarettes.map((c) => c.patchMg ?? null)).toEqual([null, 21, 21]);
    expect(j!.sousPatch).toBe(2);
    expect(j!.patchs[0]!.poseA).toBe(zonedInstant('2026-10-26', '08:00', TZ));
    const tdb = (await app.tableauDeBord())!;
    expect(tdb.patch).toMatchObject({ statut: 'porte', poseLe: zonedInstant('2026-10-26', '08:00', TZ) });
    // Retrait déclaré à 09:00 : la cigarette de 10:00 redevient « sans patch ».
    await app.retirerPatch('09:00');
    const [k] = await app.historique(1);
    expect(k!.cigarettes.map((c) => c.patchMg ?? null)).toEqual([null, 21, null]);
    await expect(app.poserPatch(21, 24, '8h7')).rejects.toThrow(/invalide/);
  });
});

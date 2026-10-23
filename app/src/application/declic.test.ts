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

import { describe, expect, it } from 'vitest';
import { randomFillSync } from 'node:crypto';
import { zonedInstant, type ContenuSante, type ReferencePharma } from '../domain';
import { FakeClock, InMemoryEventStore, MemoryNotifier, UuidV7Generator } from '../adapters/memory';
import { Declic } from './declic';

const TZ = 'Europe/Paris';
const REF: ReferencePharma = { version: 't', validePar: null, valideLe: null, oraux: [] };
const SANTE: ContenuSante = { version: 't', validePar: null, jalons: [] };

// Plan créé avant le lever (6 h 30) : le premier jour est complet (voir RM-13 pour le cas partiel).
function monter(debut = zonedInstant('2026-11-02', '06:30', TZ)) {
  const clock = new FakeClock(debut, TZ);
  const store = new InMemoryEventStore();
  const notifier = new MemoryNotifier();
  const ids = new UuidV7Generator((b) => randomFillSync(b), () => clock.now());
  const app = new Declic({ store, clock, ids, notifier, referencePharma: REF, contenuSante: SANTE });
  return { app, clock, store, notifier };
}

const PROFIL = { cigarettesParJour: 20, prixPaquetCents: 1300, cigarettesParPaquet: 20, lever: '07:00', coucher: '23:00' };

describe('Declic (cas d\'usage)', () => {
  it('sans profil, pas de tableau de bord', async () => {
    const { app } = monter();
    expect(await app.aUnProfil()).toBe(false);
    expect(await app.tableauDeBord()).toBeNull();
  });

  it('parcours : profil, cigarette, intervalle, annulation', async () => {
    const { app, clock, notifier } = monter();
    await app.creerProfil(PROFIL);
    clock.avancerMinutes(90); // 8 h : hors des heures calmes, la notification « prochaine » est gardée
    let tdb = (await app.tableauDeBord())!;
    expect(tdb.jourDuPlan).toBe(0);
    expect(tdb.quota).toBe(20);
    expect(tdb.intervalleCibleMinutes).toBe(48);
    expect(tdb.phase).toBe('reduction');

    await app.enregistrerCigarette('cafe');
    tdb = (await app.tableauDeBord())!;
    expect(tdb.fumees).toBe(1);
    expect(tdb.restant).toBe(19);
    expect(tdb.prochaine).toMatchObject({ statut: 'attendre', resteMinutes: 48 });
    expect(notifier.planifiees.some((n) => n.categorie === 'rythme')).toBe(true);

    clock.avancerMinutes(10);
    expect(await app.annulerDerniereSaisie()).toBe(true);
    tdb = (await app.tableauDeBord())!;
    expect(tdb.fumees).toBe(0);
  });

  it('le lendemain, le quota baisse de 1 et les économies de la veille sont comptées', async () => {
    const { app, clock } = monter();
    await app.creerProfil(PROFIL);
    for (let i = 0; i < 18; i++) {
      await app.enregistrerCigarette();
      clock.avancerMinutes(50);
    }
    // Lendemain 12 h (6 h 30 + 18 × 50 min = 21 h 30, puis 14 h 30 de plus).
    clock.avancerMinutes(24 * 60 - 18 * 50 + 5.5 * 60);
    const tdb = (await app.tableauDeBord())!;
    expect(tdb.jourDuPlan).toBe(1);
    expect(tdb.quota).toBe(19);
    // Veille : 2 cigarettes évitées = 1,30 € ; aujourd'hui à 12 h : 5/16 de 20 = 6,25 évitées ≈ 4,06 €.
    expect(tdb.economieTotaleCents).toBe(130 + 406);
    expect(tdb.proposerPalier).toBe(false);
  });

  it('dépassement du quota : un palier est proposé, puis appliqué', async () => {
    const { app, clock } = monter();
    await app.creerProfil({ ...PROFIL, cigarettesParJour: 3 });
    for (let i = 0; i < 4; i++) {
      await app.enregistrerCigarette();
      clock.avancerMinutes(60);
    }
    clock.avancerMinutes(24 * 60);
    let tdb = (await app.tableauDeBord())!;
    expect(tdb.quota).toBe(2);
    expect(tdb.proposerPalier).toBe(true);
    await app.demanderPalier();
    tdb = (await app.tableauDeBord())!;
    expect(tdb.quota).toBe(3);
    expect(tdb.proposerPalier).toBe(false);
  });

  it('programme la célébration du prochain palier d\'économies à l\'heure où il sera atteint', async () => {
    const { app, clock, notifier } = monter();
    await app.creerProfil(PROFIL);
    // 0,65 € par cigarette, 20 cigarettes sur 16 h : 10 € = 15,38 cigarettes évitées,
    // atteintes à 7 h + 15,38/20 × 960 min = 7 h + 738,5 min → 19 h 19 (minute supérieure).
    const celebration = notifier.planifiees.find((n) => n.cle === 'economies-1000');
    expect(celebration).toBeDefined();
    expect(celebration!.a).toBe(zonedInstant('2026-11-02', '19:19', TZ));
    // Une cigarette fumée repousse la célébration d'un « intervalle » de 48 min.
    await app.enregistrerCigarette();
    const repoussee = notifier.planifiees.find((n) => n.cle === 'economies-1000');
    expect(repoussee!.a).toBe(celebration!.a + 48 * 60_000);
    expect(clock.now()).toBe(zonedInstant('2026-11-02', '06:30', TZ));
  });

  it('patch : rappel critique programmé à l\'heure de retrait', async () => {
    const { app, notifier, clock } = monter();
    await app.creerProfil(PROFIL);
    await app.poserPatch(1, 16);
    const rappel = notifier.planifiees.find((n) => n.categorie === 'substitut');
    expect(rappel?.critique).toBe(true);
    expect(rappel?.a).toBe(clock.now() + 16 * 3_600_000);
  });

  it('substituts oraux, retrait du patch, objectif, saisie depuis la montre', async () => {
    const { app, store } = monter();
    expect(await app.annulerDerniereSaisie()).toBe(false);
    await app.demanderPalier(); // sans profil : sans effet
    await app.creerProfil(PROFIL);
    expect(await app.aUnProfil()).toBe(true);
    await app.poserPatch(1, 24);
    await app.retirerPatch();
    await app.prendreSubstitutOral('pastille', 1);
    await app.definirObjectif('Vélo', 40000);
    await app.enregistrerCigarette('stress', 'watch');
    const tdb = (await app.tableauDeBord())!;
    expect(tdb.patch.statut).toBe('aucun');
    expect(tdb.oraux.find((o) => o.forme === 'pastille')?.prisesAujourdhui).toBe(1);
    expect(tdb.objectifs).toHaveLength(1);
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

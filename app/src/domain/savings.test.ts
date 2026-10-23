import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { addMinutes, awakeWindow } from './time';
import {
  economieEnCoursCents,
  economieJourneeCents,
  formatEuros,
  joursAvantObjectif,
  prixDuJour,
  projectionArret,
  valeurCents,
  type Prix,
} from './savings';

const PRIX: Prix = { aPartirDu: '2026-11-01', prixPaquetCents: 1300, cigarettesParPaquet: 20 };

describe('économies', () => {
  it('une cigarette à 13 € le paquet de 20 vaut 0,65 €', () => {
    expect(valeurCents(1, PRIX)).toBe(65);
  });

  it('RM-07 : économie d\'une journée = (n − fumées) × prix, jamais négative', () => {
    expect(economieJourneeCents(20, 15, PRIX)).toBe(325);
    expect(economieJourneeCents(20, 25, PRIX)).toBe(0);
  });

  it('plan −1/jour de 20 à 0 : 210 cigarettes évitées ≈ 136,50 €', () => {
    let total = 0;
    for (let j = 0; j <= 20; j++) total += economieJourneeCents(20, 20 - j, PRIX);
    expect(total).toBe(13650);
  });

  it('journée en cours au prorata du temps éveillé', () => {
    const fenetre = awakeWindow('2026-11-02', { wake: '07:00', bed: '23:00' }, 'Europe/Paris');
    const midi = addMinutes(fenetre.start, 8 * 60); // moitié de la journée
    expect(economieEnCoursCents({ initial: 20, fumees: 4, prix: PRIX, fenetre, maintenant: midi })).toBe(390);
    expect(economieEnCoursCents({ initial: 20, fumees: 0, prix: PRIX, fenetre, maintenant: addMinutes(fenetre.start, -10) })).toBe(0);
    expect(economieEnCoursCents({ initial: 20, fumees: 0, prix: PRIX, fenetre, maintenant: addMinutes(fenetre.end, 60) })).toBe(1300);
  });

  it('RM-06 : un changement de prix ne réécrit pas le passé', () => {
    const historique: Prix[] = [PRIX, { aPartirDu: '2027-01-01', prixPaquetCents: 1400, cigarettesParPaquet: 20 }];
    expect(prixDuJour(historique, '2026-12-31').prixPaquetCents).toBe(1300);
    expect(prixDuJour(historique, '2027-01-01').prixPaquetCents).toBe(1400);
    expect(prixDuJour(historique, '2026-10-01').prixPaquetCents).toBe(1300);
  });

  it('projection après l\'arrêt', () => {
    expect(projectionArret(20, PRIX)).toEqual({ parJourCents: 1300, parMoisCents: 39000, parAnCents: 474500 });
  });

  it('objectif d\'épargne', () => {
    expect(joursAvantObjectif(40000, 13650, 1300)).toBe(21);
    expect(joursAvantObjectif(100, 200, 0)).toBe(0);
    expect(joursAvantObjectif(100, 0, 0)).toBeNull();
  });

  it('formatage en euros', () => {
    expect(formatEuros(65)).toBe('0,65 €');
    expect(formatEuros(474500)).toBe('4 745,00 €');
  });

  it('propriété : économie jamais négative et croissante avec les cigarettes évitées', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 60 }), fc.integer({ min: 0, max: 80 }), (n, fumees) => {
        const e = economieJourneeCents(n, fumees, PRIX);
        expect(e).toBeGreaterThanOrEqual(0);
        expect(e).toBeGreaterThanOrEqual(economieJourneeCents(n, fumees + 1, PRIX));
      }),
    );
  });
});

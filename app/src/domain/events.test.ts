import { describe, expect, it } from 'vitest';
import { effectiveEvents, validateEvent, type DomainEvent } from './events';

const base = { schemaVersion: 1 as const, tz: 'Europe/Paris', source: 'phone' as const };

describe('événements', () => {
  it('retire les saisies annulées et trie par instant puis par ordre d\'ajout', () => {
    const evs: DomainEvent[] = [
      { ...base, id: 'b', type: 'CigaretteFumee', occurredAt: '2026-11-02T10:00:00Z', payload: {} },
      { ...base, id: 'a', type: 'CigaretteFumee', occurredAt: '2026-11-02T10:00:00Z', payload: {} },
      { ...base, id: 'c', type: 'CigaretteFumee', occurredAt: '2026-11-02T09:00:00Z', payload: {} },
      { ...base, id: 'd', type: 'SaisieAnnulee', occurredAt: '2026-11-02T11:00:00Z', payload: { evenementId: 'b' } },
    ];
    expect(effectiveEvents(evs).map((e) => e.id)).toEqual(['c', 'a']);
    // À instant égal, l'ordre d'ajout est conservé (b avant a), quel que soit l'identifiant.
    expect(effectiveEvents(evs.slice(0, 3)).map((e) => e.id)).toEqual(['c', 'b', 'a']);
  });

  it('valide les invariants', () => {
    const ok: DomainEvent = {
      ...base,
      id: 'x',
      type: 'ProfilCree',
      occurredAt: '2026-11-02T10:00:00Z',
      payload: { cigarettesParJour: 20, prixPaquetCents: 1300, cigarettesParPaquet: 20, lever: '07:00', coucher: '23:00' },
    };
    expect(validateEvent(ok)).toEqual([]);
    expect(
      validateEvent({ ...ok, id: '', tz: '', occurredAt: 'pas une date', payload: { ...ok.payload, cigarettesParJour: 0, prixPaquetCents: -1, cigarettesParPaquet: 1.5 } }),
    ).toHaveLength(6);
    expect(
      validateEvent({ ...base, id: 'p', type: 'PrixModifie', occurredAt: ok.occurredAt, payload: { prixPaquetCents: 0, cigarettesParPaquet: 0, aPartirDu: '2026-11-02' } }),
    ).toHaveLength(2);
    expect(
      validateEvent({ ...base, id: 'o', type: 'ObjectifEpargneDefini', occurredAt: ok.occurredAt, payload: { libelle: 'vélo', montantCents: 0 } }),
    ).toHaveLength(1);
    expect(
      validateEvent({ ...base, id: 's', type: 'SubstitutOralPris', occurredAt: ok.occurredAt, payload: { forme: 'gomme', dosageMg: 0 } }),
    ).toHaveLength(1);
    expect(validateEvent({ ...base, id: 'e', type: 'EnvieResistee', occurredAt: ok.occurredAt, payload: {} })).toEqual([]);
  });
});

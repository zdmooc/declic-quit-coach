import { describe, expect, it } from 'vitest';
import { formatDuree } from './candidates';

describe('formatDuree', () => {
  it('formate les durées pour l\'affichage', () => {
    expect(formatDuree(0)).toBe('moins d’1 min');
    expect(formatDuree(0.4)).toBe('moins d’1 min');
    expect(formatDuree(24)).toBe('24 min');
    expect(formatDuree(60)).toBe('1 h');
    expect(formatDuree(96)).toBe('1 h 36');
    expect(formatDuree(192)).toBe('3 h 12');
  });
});

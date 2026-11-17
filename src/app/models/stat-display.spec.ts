import { hasStatBonus, statBreakdown } from './stat-display';

describe('stat display', () => {
  it('formats the base, class and modifier separately, including zero and penalties', () => {
    expect(statBreakdown(20, 3, 10)).toBe('Base Value 20; Class +3; Modifier +10');
    expect(statBreakdown('unknown', -2, 0)).toBe('Base Value unknown; Class -2; Modifier +0');
  });

  it('highlights positive bonuses, but not unmodified values or penalties alone', () => {
    expect(hasStatBonus(3)).toBeTrue();
    expect(hasStatBonus(0, 4)).toBeTrue();
    expect(hasStatBonus(-2, 4)).toBeTrue();
    expect(hasStatBonus(0)).toBeFalse();
    expect(hasStatBonus(-2, -1)).toBeFalse();
  });
});

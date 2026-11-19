import { boosterError, boosterStats, STAT_BOOSTERS, sumBoosters } from './stat-boosters';
import { projectDistributions } from './stat-distribution';
import { MAX_BASE_STATS, ZERO_GROWTH } from './growth.models';

describe('stat boosters', () => {
  it('uses the exact item effects and lifetime limits', () => {
    expect(STAT_BOOSTERS.map(({ name, key, amount, max }) => [name, key, amount, max])).toEqual([
      ['Seraph Robe', 'hp', 4, 5], ['Energy Drop', 'str', 2, 4], ['Spirit Dust', 'mag', 2, 5],
      ['Secret Book', 'dex', 2, 4], ['Speedwing', 'spd', 2, 5], ['Goddess Icon', 'lck', 2, 3],
      ['Giant Shell', 'def', 2, 3], ['Talisman', 'res', 2, 4], ['Black Pearl', 'cha', 2, 3],
      ['Shoes of the Wind', 'mov', 1, 3],
    ]);
    expect(boosterStats({ hp: 5, str: 3, mov: 3 })).toEqual({ ...ZERO_GROWTH, hp: 20, str: 6 });
    expect(boosterError(sumBoosters({ str: 2 }, { str: 3 }))).toContain('Energy Drop');
    for (const str of [-1, 1.5, NaN, Infinity]) expect(boosterError({ str })).not.toBeNull();
  });

  it('adds permanent gains only at their level and caps before external bonuses', () => {
    const rules = { growthAt: () => null, gainsAt: (level: number) => level === 5 ? boosterStats({ str: 3, hp: 5 }) : null };
    const start = { ...ZERO_GROWTH, hp: 110, str: 95 };
    expect(projectDistributions(start, 1, 4, rules).str.min).toBe(95);
    const boosted = projectDistributions(start, 1, 5, rules);
    expect(boosted.str).toEqual({ min: 99, probs: [1] });
    expect(boosted.hp.min).toBe(MAX_BASE_STATS.hp);
  });
});

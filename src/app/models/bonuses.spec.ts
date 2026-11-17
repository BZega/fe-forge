import cai from '../data/recruitment/Cai.json';
import { blazeBonusOf, inGameBonus, NO_GEAR } from './bonuses';

describe('Blaze source bonuses', () => {
  it('uses the structured source bonus rather than the legacy fallback and applies it once', () => {
    const source = cai.Blaze.Source.StatBonus;
    const original = source.Bonus;
    try {
      source.Bonus = 5;
      expect(blazeBonusOf('Cai').mag).toBe(5);
      expect(inGameBonus('Cai', 1, null, null, null, NO_GEAR).mag).toBe(5);
    } finally {
      source.Bonus = original;
    }
  });

  it('retains the existing Blaze fallback for characters without structured source bonuses', () => {
    expect(blazeBonusOf('Cai').mag).toBe(3);
    expect(blazeBonusOf('Anatolia').dex).toBe(10);
  });
});

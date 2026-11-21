import cai from '../data/recruitment/Cai.json';
import { blazeBonusOf, inGameBonus, NO_GEAR, statAbilityPickerGroups } from './bonuses';
import { abilitiesFor, StatBoostAbility } from './growth.models';
import abilities from '../data/stat-boost-abilities.json';

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

  describe('Mu ability picker', () => {
    it('keeps class abilities and presents one gated, automatically upgraded Warrior’s Blood entry', () => {
      const options = abilitiesFor(abilities as StatBoostAbility[], 'Mu');
      const items = (level: number) => statAbilityPickerGroups(options, level).flatMap((group) => group.items);
      expect(items(19).map((item) => item.name)).toContain('Attack Basics');
      expect(items(19).some((item) => item.name.startsWith("Warrior's Blood"))).toBeFalse();
      expect(items(20).filter((item) => item.id === "Warrior's Blood").map((item) => item.name)).toEqual(["Warrior's Blood"]);
      expect(items(34).filter((item) => item.id === "Warrior's Blood").map((item) => item.name)).toEqual(["Warrior's Blood"]);
      expect(items(35).filter((item) => item.id === "Warrior's Blood").map((item) => item.name)).toEqual(["Warrior's Blood+"]);
    });
  });

  it('retains the existing Blaze fallback for characters without structured source bonuses', () => {
    expect(blazeBonusOf('Cai').mag).toBe(3);
    expect(blazeBonusOf('Anatolia').dex).toBe(10);
  });
});

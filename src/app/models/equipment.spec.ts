import { inGameBonus } from './bonuses';
import unitClassData from '../data/unit-classes.json';
import { equippedItems, equipmentSlot, equipmentWeapon, ITEMS, Item, itemBoosts, itemVariants } from './equipment';
import { STAT_KEYS, toGrowth, UnitClass } from './growth.models';

describe('equipment', () => {
  const sword = ITEMS.find((item) => item.Name === 'Wooden Sword')!;

  it('ships Wooden Sword without stat bonuses', () => {
    expect(sword.BonusStats).toBeNull();
    expect(itemBoosts(sword)).toEqual(toGrowth(null));
    expect(itemBoosts({ ...sword, BonusStats: undefined })).toEqual(toGrowth(null));
  });

  it('only offers existing single-digit upgrades in level order, including the base', () => {
    const catalog = ['Wooden Sword+9', 'Wooden Sword+3', 'Wooden Sword', 'Wooden Sword+10', 'Other Sword+1']
      .map((Name) => ({ ...sword, Name }));
    expect(itemVariants(catalog[0], catalog).map((item) => item.Name))
      .toEqual(['Wooden Sword', 'Wooden Sword+3', 'Wooden Sword+9']);
  });

  it('recognizes all nine stats case-insensitively and ignores combat values', () => {
    const boosts = itemBoosts({ ...sword, BonusStats: [
      { HP: 1, STR: 2, Mag: 3, spd: 4, DEX: 5, Def: 6, Res: 7, Lck: 8, Cha: 9, Mt: 99 },
      { Spd: 2 },
    ] });
    expect(STAT_KEYS.map((stat) => boosts[stat])).toEqual([1, 2, 3, 6, 5, 6, 7, 8, 9]);
    expect(itemBoosts({ ...sword, BonusStats: null, BonusStat: [{ Spd: -2 }] }).spd).toBe(-2);
  });

  it('allows one weapon total and one item per equipment type', () => {
    const types = ['Sword', 'Axe', 'Shield', 'Shield', 'Mask', 'Staff', 'Accessory'];
    const items: Item[] = types.map((WeaponType, index) => ({ ...sword, WeaponType, Name: String(index) }));
    const equipped = equippedItems(items.map((item) => item.Name), items);
    expect(equipped.map((item) => item.Name)).toEqual(['1', '3', '4', '5', '6']);
    expect(equipped.map(equipmentSlot)).toEqual(['Weapon', 'Shield', 'Mask', 'Staff', 'Accessory']);
  });

  it('uses the equipped weapon instead of the legacy ability weapon type', () => {
    expect(equipmentWeapon([sword.Name], 'axe')).toBe('sword');
    expect(equipmentWeapon([], 'axe')).toBe('axe');
    expect(equipmentWeapon([])).toBeNull();
  });

  it('recognizes plural Gauntlets and magic weapon labels for ability bonuses', () => {
    const original = sword.WeaponType;
    try {
      sword.WeaponType = 'Gauntlets';
      expect(equipmentWeapon([sword.Name])).toBe('gauntlet');
      sword.WeaponType = 'Black Magic';
      expect(equipmentWeapon([sword.Name])).toBe('blackMagic');
    } finally {
      sword.WeaponType = original;
    }
  });

  describe('shared bonus cap', () => {
    const original = sword.BonusStats;
    beforeEach(() => { sword.BonusStats = [{ Spd: 4, Str: 2 }]; });
    afterEach(() => { sword.BonusStats = original; });

    it('sums equipment with abilities before capping, leaving class bonuses outside the cap', () => {
      const noble = (unitClassData as UnitClass[]).find((unitClass) => unitClass.name === 'Noble/Commoner')!;
      const unitClass = { ...noble, bonusStats: { ...noble.bonusStats, spd: 3 } };
      const gear = {
        equipment: [sword.Name],
        abilities: [{ name: 'Boost', description: '', boosts: { spd: 8 }, weaponBoosts: { sword: { str: 3 } } }],
        weapon: 'axe' as const,
        battalion: null,
      };
      const result = inGameBonus('', 1, unitClass, null, null, gear);
      expect(result.spd).toBe(13);
      expect(result.str).toBe(5);
      expect(inGameBonus('', 1, null, null, null, { ...gear, equipment: [] }).spd).toBe(8);
    });
  });
});

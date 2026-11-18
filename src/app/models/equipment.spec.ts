import { inGameBonus } from './bonuses';
import unitClassData from '../data/unit-classes.json';
import abilityData from '../data/stat-boost-abilities.json';
import { equippedItems, equipmentSlot, equipmentWeapon, ITEMS, Item, itemBoosts, itemVariants } from './equipment';
import { STAT_KEYS, StatBoostAbility, StatKey, toGrowth, UnitClass } from './growth.models';

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

  describe('sword catalog', () => {
    const families: [string, number[]][] = [
      ['Bronze Sword', [4, 6, 8, 18, 20, 22]],
      ['Iron Sword', [9, 11, 13, 19, 21, 22]],
      ['Da Mina Sword', [12, 15, 20, 23]],
      ['Silver Sword', [18, 20, 22, 24]],
      ['Venin Edge', [3, 4, 5, 16, 17, 18]],
      ['Zanbato', [14, 15, 17, 19]],
      ['Killing Edge', [11, 12, 17, 20]],
      ['Flyssa', [10, 11, 14, 18]],
      ['Levin Sword', [12, 14, 17, 20]],
      ['Whirlwind Blade', [8, 12, 17, 20]],
      ['Greatsword', [15, 20, 22, 24]],
      ['Cleansing Blade', [8, 12, 17, 20]],
      ['Angela', [14, 15, 16, 18]],
      ['Veroquine', [13, 14, 15, 17]],
      ["Lakshashi's Iron Fan", [10, 13, 16, 19]],
      ['Long-Night Katara', [5, 7, 15, 22]],
      ['Answerer', [9, 11, 13, 17]],
      ['Chosen Sword', [6, 11, 13, 15]],
      ['Royal Sword', [5, 10, 12, 14]],
      ['Smoldering Sword', [20, 22, 24, 26]],
    ];
    const item = (name: string) => ITEMS.find((candidate) => candidate.Name === name)!;

    for (const [name, might] of families) {
      it(`includes every supplied ${name} upgrade and might value`, () => {
        const variants = itemVariants(item(name), ITEMS).filter((variant) => variant.Name === name || /\+[0-9]$/.test(variant.Name));
        expect(variants.map((variant) => variant.Name))
          .toEqual(might.map((_, index) => name + (index === 0 ? '' : `+${index}`)));
        expect(variants.map((variant) => variant.Mt)).toEqual(might);
        expect(variants.every((variant) => variant.WeaponType === 'Sword' && variant.Description.length > 0)).toBeTrue();
      });
    }

    it('keeps unique names and the named Answerer upgrades', () => {
      expect(new Set(ITEMS.map((entry) => entry.Name)).size).toBe(ITEMS.length);
      expect(['Answerer Arisen', 'Answerer Breaker', 'Answerer Huang'].map((name) => item(name).Mt))
        .toEqual([15, 18, 21]);
    });

    it('applies unconditional bonuses without turning combat effects into base stats', () => {
      expect([3, 4, 5].map((level) => itemBoosts(item(`Bronze Sword+${level}`)).def)).toEqual([1, 2, 3]);
      expect([3, 4, 5].map((level) => itemBoosts(item(`Iron Sword+${level}`)).dex)).toEqual([2, 4, 6]);
      expect([1, 2, 3].map((level) => itemBoosts(item(`Veroquine+${level}`)).dex)).toEqual([3, 5, 8]);
      for (const name of ['Da Mina Sword+3', 'Zanbato+3', 'Whirlwind Blade+3', 'Chosen Sword+3']) {
        expect(itemBoosts(item(name))).toEqual(toGrowth(null));
      }
      expect(item('Da Mina Sword+3').Description).toContain('Hit/Crit+10 when attacking with a combat art');
      expect(item('Whirlwind Blade+3').Avo).toBe(10);
      expect(Number(item('Angela+3').Curse)).toBe(2);
    });

    it('retains effectiveness, multiple rank requirements, range, and durability upgrades', () => {
      expect(item('Zanbato+3').EffectiveType).toEqual(['Cavalry']);
      expect(item('Flyssa+3').EffectiveType).toEqual(['Armor']);
      expect(item('Greatsword+3').Skills).toEqual([
        { SkillType: 'Sword', SkillRank: 'D' }, { SkillType: 'Axe', SkillRank: 'D' },
      ]);
      expect(item('Veroquine+3').Skills).toEqual([
        { SkillType: 'Sword', SkillRank: 'B' }, { SkillType: 'Axe', SkillRank: 'C' },
      ]);
      expect(item('Levin Sword+3').Range).toBe('1-2');
      expect([0, 1, 2, 3].map((level) => item(`Chosen Sword${level ? `+${level}` : ''}`).Durability))
        .toEqual(['20/20', '25/25', '30/30', '30/30']);
      expect([0, 1, 2, 3].map((level) => item(`Royal Sword${level ? `+${level}` : ''}`).Durability))
        .toEqual(['10/10', '15/15', '20/20', '20/20']);
    });
  });

  describe('remaining weapon and magic catalog', () => {
    const item = (name: string) => ITEMS.find((candidate) => candidate.Name === name)!;
    const types = ['Spear', 'Axe', 'Bow', 'Gauntlets', 'Black Magic', 'White Magic'];

    it('includes all 426 supplied entries without duplicate names or incomplete records', () => {
      expect(types.map((type) => ITEMS.filter((entry) => entry.WeaponType === type).length))
        .toEqual([116, 98, 83, 84, 24, 21]);
      expect(new Set(ITEMS.map((entry) => entry.Name)).size).toBe(ITEMS.length);
      for (const entry of ITEMS.filter((candidate) => types.includes(candidate.WeaponType))) {
        expect(entry.Description.length).withContext(entry.Name).toBeGreaterThan(0);
        expect(entry.Durability).withContext(entry.Name).toMatch(/^\d+\/\d+$/);
        expect(entry.Skills.length).withContext(entry.Name).toBeGreaterThan(0);
        expect(entry.Description).withContext(entry.Name)
          .not.toMatch(/Eff\.|Effective\+?\s+vs|Cursed\s*\+|Combat [Aa]rt:|(?:^|\.\s+)(?:Grants )?Avo\+\d+\./);
        expect(entry.Curse).withContext(entry.Name).toMatch(/^(?:--|\d+)$/);
        expect(entry.Description).withContext(entry.Name).not.toMatch(/ x\d+,|Smithing Stone|Warrior's Soulstone/);
      }
    });

    for (const [name, might] of [
      ['Wooden Spear', [3, 4, 5, 6, 7, 15, 16, 17, 18, 20]],
      ['Bronze Axe', [7, 9, 11, 20, 23, 25]],
      ['Silver Bow', [18, 20, 21, 23]],
      ['Wooden Gauntlets', [2, 3, 4, 5, 6, 15, 16, 17, 18, 20]],
      ['Shining Spear', [18, 19, 20, 21, 23, 25]],
    ] as [string, number[]][]) {
      it(`retains every supplied ${name} upgrade and Might value`, () => {
        const variants = itemVariants(item(name), ITEMS);
        expect(variants.map((variant) => variant.Name))
          .toEqual(might.map((_, index) => name + (index ? `+${index}` : '')));
        expect(variants.map((variant) => variant.Mt)).toEqual(might);
      });
    }

    it('moves standalone Avoid into Avo while keeping conditional Avoid in the description', () => {
      expect(item('Guandao+3').Avo).toBe(10);
      expect(item('Guandao+3').Description).not.toContain('Avo');
      expect([1, 2, 3, 4, 5, 6, 7, 8, 9].map((level) => item(`Wooden Gauntlets+${level}`).Avo))
        .toEqual([5, 7, 7, 9, 9, 11, 11, 13, 15]);
      expect(item('Tempest Bow+3').Avo).toBe(10);
      expect(item('Tempest Bow+3').Description).toContain('If unit attacks first, grants Avo+10 during combat.');
      expect(item('Javelin+3').Avo).toBe(0);
      expect(item('Javelin+3').Description).toContain('Grants Avo+10 during combat against a foe 2+ spaces away.');
      expect(item('Qiankun Circles+3').Avo).toBe(0);
      expect(item('Qiankun Circles+3').Description).toContain('Hit/Crit/Avo+10 during combat');
    });

    it('retains normal and enhanced effectiveness on upgrades and splits multiple targets', () => {
      expect(item('Halberd+3').EffectiveType).toEqual(['Cavalry', 'Armor']);
      expect(item('Ridersbane+3').EffectiveType).toEqual(['Extra Cavalry']);
      expect(item("Hunter's Bow+3").EffectiveType).toEqual(['Extra Flying', 'Beast']);
      expect(item('Venin Bow+5').EffectiveType).toEqual(['Extra Flying']);
      expect(item('Dark Spikes T').EffectiveType).toEqual(['Extra Cavalry']);
      expect(item('Glass Wheel').EffectiveType).toEqual(['Flying']);
      expect(item('Seraphim').EffectiveType).toEqual(['Undead']);
      expect(item('Glass Wheel').Description).toBe("Attacks a foe with shards of razor-sharp glass. Calculates damage based on foe's Prt.");
    });

    it('retains Curse numbers and combat art access even when an effect references that art', () => {
      expect(item('Muen+3').Curse).toBe('2');
      expect(item("Ursa's Right Claw").Curse).toBe('1');
      expect(item('Muen+3').Description).toContain('Allows use of the Black Roar combat art.');
      expect(item('Muen+3').Description).toContain('Hit+20 to Black Roar combat art.');
      expect(item('Ji+3').Description).toContain('Allows use of the Windweave combat art.');
      expect(item('Shining Spear+5').Description).toContain('Allows use of the Sol combat art.');
      expect(item('Grasitha+3').Description).toBe("A Hero's Relic. Allows Esmeralda use of the Leave No Dust combat art.");
    });

    it('only treats unconditional self-stat bonuses as equipment bonuses', () => {
      expect(itemBoosts(item('Wooden Spear+9')).spd).toBe(5);
      expect(itemBoosts(item('Bronze Axe+5')).def).toBe(3);
      expect(itemBoosts(item('Iron Bow+5')).dex).toBe(6);
      expect(itemBoosts(item('Resistant Gauntlets+3')).res).toBe(8);
      expect(itemBoosts(item('Halberd+3')).dex).toBe(5);
      for (const name of ['Ward', 'Counter Gauntlets+3', 'Pilum+3']) {
        expect(itemBoosts(item(name))).toEqual(toGrowth(null));
      }
    });

    it('maps magic types and healing power to the existing item schema', () => {
      expect(item('Heal').Mt).toBe('--');
      expect(item('Heal').Pwr).toBe(10);
      expect(item('Fortify').Pwr).toBe(20);
      expect(item('Nosferatu').Mt).toBe(1);
      expect(item('Heal').Skills).toEqual([{ SkillType: 'White Magic', SkillRank: 'D' }]);
      expect(item('Banshee Θ').Skills).toEqual([{ SkillType: 'Black Magic', SkillRank: 'B*' }]);
      expect(item('Windfire Rings+3').Skills).toEqual([
        { SkillType: 'Gauntlets', SkillRank: 'B' }, { SkillType: 'Sword', SkillRank: 'D' },
      ]);
    });

    it('inherits stats instead of guessing at unaligned or missing source values', () => {
      expect(item("Lulu's Spear+1").Wt).toBe(item("Lulu's Spear").Wt);
      expect(item('Chosen Lance+2').Durability).toBe('20/20');
      expect(item('Prototype VII (DLC)+2').Wt).toBe(item('Prototype VII (DLC)').Wt);
      expect(item('Prototype VII (DLC)+2').Durability).toBe('5/5');
      expect(item('Salamander+1').Mt).toBe(2);
      expect(item('Salamander+4').Hit).toBe(80);
      expect(item('Resistant Gauntlets+1').Mt).toBe(12);
      expect(itemBoosts(item('Resistant Gauntlets+1')).res).toBe(4);
    });
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

  it('uses only the equipped inventory weapon type', () => {
    expect(equipmentWeapon([sword.Name])).toBe('sword');
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

  describe("Warrior's Blood inventory association", () => {
    const blood = (abilityData as StatBoostAbility[]).find((ability) => ability.name === "Warrior's Blood")!;
    const bonus = (equipment: string[], level = 35, abilities = [blood]) =>
      inGameBonus('Mu', level, null, null, null, { equipment, abilities, weapon: 'axe', battalion: null });
    const cases: [string, StatKey[], StatKey[]][] = [
      ['Wooden Sword', ['spd'], ['spd', 'dex']],
      ['Answerer+3', ['spd'], ['spd', 'dex']],
      ['Answerer Huang', ['spd'], ['spd', 'dex']],
      ['Wooden Spear', ['dex'], ['dex', 'def']],
      ['Bronze Axe', ['str'], ['str', 'def']],
      ['Silver Bow', ['dex'], ['str', 'dex']],
      ['Wooden Gauntlets', ['str'], ['str', 'spd']],
      ['Blizzard', ['res'], ['mag', 'res']],
      ['Heal', ['mag'], ['mag', 'res']],
    ];

    for (const [name, normal, upgraded] of cases) {
      it(`derives the learned and upgraded bonuses from ${name}`, () => {
        expect(ITEMS.some((item) => item.Name === name)).toBeTrue();
        for (const [level, stats] of [[19, []], [20, normal], [34, normal], [35, upgraded]] as [number, StatKey[]][]) {
          const equipped = bonus([name], level);
          const withoutAbility = bonus([name], level, []);
          expect(STAT_KEYS.map((stat) => equipped[stat] - withoutAbility[stat]))
            .withContext(`${name} at Lv ${level}`)
            .toEqual(STAT_KEYS.map((stat) => stats.includes(stat) ? 2 : 0));
        }
      });
    }

    it('does not use a legacy weapon type when Inventory has no weapon', () => {
      expect(bonus([])).toEqual(toGrowth(null));
      expect(inGameBonus('Majide', 35, null, null, null, {
        abilities: [], weapon: 'axe', battalion: null,
      })).toEqual(toGrowth(null));
      expect(inGameBonus('Majide', 35, null, null, null, {
        equipment: ['Bronze Axe'], abilities: [], weapon: null, battalion: null,
      }).str).toBe(3);
    });

    it('shares the +10 cap with other stat bonuses', () => {
      const boost = { name: 'Test speed boost', description: '', boosts: { spd: 9 } };
      expect(bonus(['Wooden Sword'], 35, [blood, boost]).spd).toBe(10);
      expect(bonus([], 35, [blood, boost]).spd).toBe(9);
    });
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

import classMountTypes from '../data/class-mount-types.json';
import { RECRUITMENT_FILES } from '../data/recruitment';
import statBoostData from '../data/stat-boost-abilities.json';
import { equippedItems, equipmentWeapon, itemBoosts } from './equipment';
import {
  abilityBoosts,
  abilityFamily,
  abilityPickerGroups,
  Battalion,
  characterKey,
  GrowthRates,
  isLearned,
  Mount,
  mountBonusAt,
  STAT_KEYS,
  StatBoostAbility,
  StatKey,
  sumGrowth,
  toGrowth,
  UnitClass,
  WeaponKey,
} from './growth.models';

export const MAX_EXTRA_BONUS = 10;

type StatBoosts = Partial<Record<StatKey, number>>;

const BLAZE_BONUSES: Readonly<Record<string, StatBoosts>> = {
  Anatolia: { dex: 10 },
  Bertrand: { str: 5 },
  Cai: { mag: 3 },
  Dietrich: { dex: 5 },
  Eshmel: { dex: 10 },
  Leda: { res: 5 },
  Orchel: { def: 5 },
  Talimun: { mag: 3 },
  Theodora: { str: 6 },
};

type RecruitmentBlaze = {
  UnitId: string;
  BlazeBonuses?: Record<string, number> | null;
  Blaze?: { Source?: { StatBonus?: { StatType: string; Bonus: number } | null } | null } | null;
};

export function blazeBonusOf(unitName: string): GrowthRates {
  const key = characterKey(unitName);
  const file = (RECRUITMENT_FILES as RecruitmentBlaze[]).find((file) => file.UnitId === key);
  const listed = file?.BlazeBonuses;
  const source = file?.Blaze?.Source?.StatBonus;

  return toGrowth(
    listed
      ? Object.fromEntries(Object.entries(listed).map(([stat, value]) => [stat.toLowerCase(), value]))
      : source ? { [source.StatType.toLowerCase()]: source.Bonus } : (BLAZE_BONUSES[key] ?? null),
  );
}

export interface PersonalBonus {
  name: string;
  description: string;
  fromLevel: number;
  boosts: StatBoosts;
  weaponBoosts?: StatBoostAbility['weaponBoosts'];
}

const PERSONAL_BONUSES: Readonly<Record<string, readonly PersonalBonus[]>> = {
  Majide: [{ name: 'Hellbent Axe', description: 'When equipped with an axe, grants Atk+3.', fromLevel: 1, boosts: {}, weaponBoosts: { axe: { str: 3 } } }],
  Orchel: [{ name: 'Solid and Sturdy', description: 'Grants Def+5. Unit is armored. Cannot change to cavalry or flying.', fromLevel: 1, boosts: { def: 5 } }],
  Talimun: [{ name: 'Swashbuckler’s Luck', description: 'Grants Lck+3.', fromLevel: 1, boosts: { lck: 3 } }],
};

export function personalBonusesAt(unitName: string, level: number): PersonalBonus[] {
  return (PERSONAL_BONUSES[characterKey(unitName)] ?? []).filter((bonus) => bonus.fromLevel <= level);
}

export interface InGameGear {
  equipment?: readonly string[];
  abilities: readonly StatBoostAbility[];
  weapon: WeaponKey | null;
  battalion: Battalion | null;
}

export const NO_GEAR: InGameGear = { abilities: [], weapon: null, battalion: null };

export function isMountedClass(className: string): boolean {
  return ((classMountTypes as Record<string, string>)[className] ?? 'None') !== 'None';
}

const ALL_ABILITIES = statBoostData as StatBoostAbility[];

export function abilityAt(ability: StatBoostAbility, level: number): StatBoostAbility | null {
  const family = abilityFamily(ability);
  const learned = ALL_ABILITIES.filter((candidate) => abilityFamily(candidate) === family && isLearned(candidate, level));

  if (learned.length === 0) {
    return isLearned(ability, level) ? ability : null;
  }

  return learned.reduce((latest, candidate) => ((candidate.learnedAt ?? 0) > (latest.learnedAt ?? 0) ? candidate : latest));
}

export function abilitiesAt(abilities: readonly StatBoostAbility[], level: number): StatBoostAbility[] {
  const byFamily = new Map<string, StatBoostAbility>();

  for (const ability of abilities) {
    const current = abilityAt(ability, level);

    if (current) {
      byFamily.set(abilityFamily(current), current);
    }
  }

  return [...byFamily.values()];
}

export function abilityLock(ability: StatBoostAbility, level: number): string | undefined {
  if (!isLearned(ability, level)) {
    return `Learned at Lv ${ability.learnedAt}`;
  }

  const current = abilityAt(ability, level);

  return current && current.name !== ability.name ? `Replaced by ${current.name} from Lv ${current.learnedAt}` : undefined;
}

export function statAbilityPickerGroups(abilities: readonly StatBoostAbility[], level: number) {
  const visible = abilities.flatMap((ability) => {
    if (!ability.characters) return [ability];
    if (ability.upgradeOf) return [];
    const current = abilityAt(ability, level);
    return current ? [current] : [];
  });
  return abilityPickerGroups(visible, (ability) => ability.characters ? undefined : abilityLock(ability, level))
    .map((group) => ({ ...group, items: group.items.map((item) => ({ ...item, id: item.family })) }));
}

export function usesWeapon(unitName: string, level: number, abilities: readonly StatBoostAbility[]): boolean {
  return [...abilitiesAt(abilities, level), ...personalBonusesAt(unitName, level)].some(
    (bonus) => bonus.weaponBoosts,
  );
}

export function inGameBonus(
  unitName: string,
  level: number,
  unitClass: UnitClass | null,
  mount: Mount | null,
  bondLevel: number | null,
  gear: InGameGear,
): GrowthRates {
  const mounted = unitClass !== null && isMountedClass(unitClass.name);
  const weapon = equipmentWeapon(gear.equipment);
  const extras = sumGrowth(
    ...equippedItems(gear.equipment).map(itemBoosts),
    toGrowth(mountBonusAt(mount, bondLevel)),
    abilityBoosts(abilitiesAt(gear.abilities, level), weapon),
    toGrowth(unitClass === null || mounted ? null : gear.battalion),
    blazeBonusOf(unitName),
    abilityBoosts(personalBonusesAt(unitName, level), weapon),
  );
  const result = toGrowth(unitClass?.bonusStats ?? null);

  for (const stat of STAT_KEYS) {
    result[stat] += Math.min(MAX_EXTRA_BONUS, extras[stat]);
  }

  return result;
}

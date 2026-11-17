import itemData from '../data/item.json';
import { GrowthRates, SKILL_LABELS, STAT_KEYS, STAT_LABELS, toGrowth, WEAPON_KEYS, WeaponKey } from './growth.models';

export interface Item {
  Name: string;
  Description: string;
  Durability: string;
  EffectiveType: readonly string[];
  Mt: number | string;
  Pwr?: number | string;
  Hit: number | string;
  Crit: number | string;
  Curse: string;
  Wt: number | string;
  Avo: number | string;
  Range: string;
  WeaponType: string;
  BonusStats?: readonly Readonly<Record<string, number>>[] | null;
  BonusStat?: readonly Readonly<Record<string, number>>[] | null;
  Skills: readonly { SkillType: string; SkillRank: string }[];
}

export const EQUIPMENT_SLOTS = ['Weapon', 'Shield', 'Mask', 'Staff', 'Accessory'] as const;
export type EquipmentSlot = (typeof EQUIPMENT_SLOTS)[number];
export const ITEMS: readonly Item[] = itemData;

export function itemBaseName(name: string): string {
  return name.replace(/\+[0-9]$/, '');
}

export function itemVariants(item: Item, catalog: readonly Item[]): Item[] {
  const base = itemBaseName(item.Name);
  return catalog.filter((candidate) =>
    itemBaseName(candidate.Name) === base && candidate.WeaponType === item.WeaponType,
  ).sort((a, b) => {
    const level = (name: string) => name === base ? -1 : Number(name.slice(-1));
    return level(a.Name) - level(b.Name);
  });
}

export function equipmentSlot(item: Item): EquipmentSlot {
  return EQUIPMENT_SLOTS.find((slot) => slot.toLowerCase() === item.WeaponType.toLowerCase()) ?? 'Weapon';
}

export function equippedItems(names: readonly string[] = [], catalog: readonly Item[] = ITEMS): Item[] {
  const slots = new Map<EquipmentSlot, Item>();

  for (const name of names) {
    const item = catalog.find((candidate) => candidate.Name === name);
    if (item) {
      slots.set(equipmentSlot(item), item);
    }
  }

  return [...slots.values()];
}

export function itemBoosts(item: Item): GrowthRates {
  const boosts = toGrowth(null);

  for (const entry of item.BonusStats ?? item.BonusStat ?? []) {
    for (const [key, value] of Object.entries(entry)) {
      const stat = STAT_KEYS.find((stat) => stat === key.toLowerCase());
      if (stat) {
        boosts[stat] += value;
      }
    }
  }

  return boosts;
}

export function equipmentWeapon(names: readonly string[] = [], fallback: WeaponKey | null = null): WeaponKey | null {
  const weapon = equippedItems(names).find((item) => equipmentSlot(item) === 'Weapon');
  if (!weapon) {
    return fallback;
  }

  const type = weapon.WeaponType.toLowerCase();
  return WEAPON_KEYS.find((key) =>
    key.toLowerCase() === type || SKILL_LABELS[key].toLowerCase() === type || (key === 'gauntlet' && type === 'gauntlets'),
  ) ?? null;
}

export function hasEquipmentWeapon(names: readonly string[] = []): boolean {
  return equippedItems(names).some((item) => equipmentSlot(item) === 'Weapon');
}

export function itemBonusDescription(item: Item): string {
  const boosts = itemBoosts(item);
  const stats = STAT_KEYS.filter((stat) => boosts[stat] !== 0)
    .map((stat) => `${STAT_LABELS[stat]} ${boosts[stat] > 0 ? '+' : ''}${boosts[stat]}`);
  return stats.join(', ');
}

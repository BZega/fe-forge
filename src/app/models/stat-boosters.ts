import { GrowthRates, StatKey, ZERO_GROWTH } from './growth.models';

export type BoosterKey = StatKey | 'mov';
export type BoosterCounts = Partial<Record<BoosterKey, number>>;
export interface BoosterEntry {
  key: number | null;
  level?: number;
  label: string;
  counts: BoosterCounts;
}
export const STAT_BOOSTERS: readonly { key: BoosterKey; name: string; amount: number; max: number; stat: string }[] = [
  { key: 'hp', name: 'Seraph Robe', amount: 4, max: 5, stat: 'HP' },
  { key: 'str', name: 'Energy Drop', amount: 2, max: 4, stat: 'Str' },
  { key: 'mag', name: 'Spirit Dust', amount: 2, max: 5, stat: 'Mag' },
  { key: 'dex', name: 'Secret Book', amount: 2, max: 4, stat: 'Dex' },
  { key: 'spd', name: 'Speedwing', amount: 2, max: 5, stat: 'Spd' },
  { key: 'lck', name: 'Goddess Icon', amount: 2, max: 3, stat: 'Lck' },
  { key: 'def', name: 'Giant Shell', amount: 2, max: 3, stat: 'Def' },
  { key: 'res', name: 'Talisman', amount: 2, max: 4, stat: 'Res' },
  { key: 'cha', name: 'Black Pearl', amount: 2, max: 3, stat: 'Cha' },
  { key: 'mov', name: 'Shoes of the Wind', amount: 1, max: 3, stat: 'Mov' },
];

export function sumBoosters(...counts: readonly BoosterCounts[]): BoosterCounts {
  return Object.fromEntries(STAT_BOOSTERS.map(({ key }) => [key, counts.reduce((sum, entry) => sum + (entry[key] ?? 0), 0)]));
}

export function boosterStats(counts: BoosterCounts): GrowthRates {
  const stats = { ...ZERO_GROWTH };
  for (const booster of STAT_BOOSTERS) {
    if (booster.key !== 'mov') stats[booster.key] = (counts[booster.key] ?? 0) * booster.amount;
  }
  return stats;
}

export function boosterError(counts: BoosterCounts): string | null {
  for (const { key, name, max } of STAT_BOOSTERS) {
    const count = counts[key] ?? 0;
    if (!Number.isInteger(count) || count < 0 || count > max) return `${name}: choose 0-${max} total uses per timeline.`;
  }
  return null;
}

export function boosterDescription(counts: BoosterCounts): string {
  return STAT_BOOSTERS.filter(({ key }) => (counts[key] ?? 0) > 0)
    .map(({ key, name, amount, stat }) => `${name} x${counts[key]} (+${(counts[key] ?? 0) * amount} ${stat})`).join(', ');
}

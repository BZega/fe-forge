import { GrowthRates, MAX_BASE_STATS, STAT_KEYS, StatKey } from './growth.models';

export interface StatDistribution {
  min: number;
  probs: number[];
}

export interface LevelUpChance {
  sure: number;
  chance: number;
}

export function levelUpChances(growth: GrowthRates, minimum = 0): Record<StatKey, LevelUpChance> {
  const sure = (stat: StatKey) => (growth[stat] > 0 ? Math.floor(growth[stat] / 100) : 0);
  const roll = (stat: StatKey) => (growth[stat] > 0 ? (growth[stat] % 100) / 100 : 0);
  const eligible = STAT_KEYS.filter((stat) => growth[stat] > 0);
  const risen = (stat: StatKey) => (sure(stat) > 0 ? 1 : roll(stat));
  const result = {} as Record<StatKey, LevelUpChance>;

  for (const stat of STAT_KEYS) {
    const base = roll(stat);
    let extra = 0;

    if (minimum > 0 && sure(stat) === 0 && growth[stat] > 0) {
      const others = eligible.filter((other) => other !== stat).map(risen);
      const count = countDistribution(others);
      const pool = eligible.length;

      count.forEach((chance, rose) => {
        if (rose < minimum) {
          extra += chance * (Math.min(minimum - rose, pool - rose) / (pool - rose));
        }
      });
    }

    result[stat] = { sure: sure(stat), chance: base + (1 - base) * extra };
  }

  return result;
}

function countDistribution(chances: readonly number[]): number[] {
  let counts = [1];

  for (const chance of chances) {
    const next = new Array(counts.length + 1).fill(0);

    counts.forEach((value, k) => {
      next[k] += value * (1 - chance);
      next[k + 1] += value * chance;
    });

    counts = next;
  }

  return counts;
}

export function pointDistribution(value: number): StatDistribution {
  return { min: Math.round(value), probs: [1] };
}

export function addLevelUp(distribution: StatDistribution, { sure, chance }: LevelUpChance): StatDistribution {
  const probs = new Array(distribution.probs.length + 1).fill(0);

  distribution.probs.forEach((value, index) => {
    probs[index] += value * (1 - chance);
    probs[index + 1] += value * chance;
  });

  return trim({ min: distribution.min + sure, probs });
}

export function applyFloor(distribution: StatDistribution, floor: number): StatDistribution {
  const below = floor - distribution.min;

  if (below <= 0) {
    return distribution;
  }

  const raised = distribution.probs.slice(0, below).reduce((sum, value) => sum + value, 0);
  const rest = distribution.probs.slice(below);

  return trim({ min: floor, probs: rest.length > 0 ? [raised + rest[0], ...rest.slice(1)] : [raised] });
}

export function shift(distribution: StatDistribution, by: number): StatDistribution {
  return { min: distribution.min + by, probs: distribution.probs };
}

export function applyCeiling(distribution: StatDistribution, ceiling: number): StatDistribution {
  const last = ceiling - distribution.min;
  if (last < 0) {
    return pointDistribution(ceiling);
  }
  if (last >= distribution.probs.length - 1) {
    return distribution;
  }
  const probs = distribution.probs.slice(0, last + 1);
  probs[last] += distribution.probs.slice(last + 1).reduce((sum, value) => sum + value, 0);
  return trim({ min: distribution.min, probs });
}

function trim(distribution: StatDistribution): StatDistribution {
  let start = 0;
  let end = distribution.probs.length;

  while (start < end - 1 && distribution.probs[start] === 0) {
    start++;
  }

  while (end > start + 1 && distribution.probs[end - 1] === 0) {
    end--;
  }

  return { min: distribution.min + start, probs: distribution.probs.slice(start, end) };
}

export interface ProjectionRules {
  growthAt: (level: number) => GrowthRates | null;
  floorsAt?: (level: number) => GrowthRates | null;
  minimumAt?: (level: number) => number;
}

export function projectDistributions(
  start: GrowthRates,
  startLevel: number,
  endLevel: number,
  rules: ProjectionRules,
): Record<StatKey, StatDistribution> {
  const result = {} as Record<StatKey, StatDistribution>;

  for (const stat of STAT_KEYS) {
    result[stat] = pointDistribution(Math.min(MAX_BASE_STATS[stat], start[stat]));
  }

  for (let level = startLevel; level <= endLevel; level++) {
    const floors = level > startLevel ? (rules.floorsAt?.(level) ?? null) : null;

    if (floors) {
      for (const stat of STAT_KEYS) {
        result[stat] = applyCeiling(applyFloor(result[stat], floors[stat]), MAX_BASE_STATS[stat]);
      }
    }

    const growth = level < endLevel ? rules.growthAt(level) : null;

    if (growth) {
      const chances = levelUpChances(growth, rules.minimumAt?.(level) ?? 0);

      for (const stat of STAT_KEYS) {
        result[stat] = applyCeiling(addLevelUp(result[stat], chances[stat]), MAX_BASE_STATS[stat]);
      }
    }
  }

  return result;
}

export interface DistributionSummary {
  mean: number;
  sd: number;
  low: number;
  high: number;
  p10: number;
  p25: number;
  p75: number;
  p90: number;
}

export function summarize(distribution: StatDistribution): DistributionSummary {
  const { min, probs } = distribution;
  const mean = probs.reduce((sum, value, index) => sum + value * (min + index), 0);
  const variance = probs.reduce((sum, value, index) => sum + value * (min + index - mean) ** 2, 0);

  return {
    mean,
    sd: Math.sqrt(Math.max(0, variance)),
    low: min,
    high: min + probs.length - 1,
    p10: quantile(distribution, 0.1),
    p25: quantile(distribution, 0.25),
    p75: quantile(distribution, 0.75),
    p90: quantile(distribution, 0.9),
  };
}

export function quantile(distribution: StatDistribution, q: number): number {
  let total = 0;

  for (let index = 0; index < distribution.probs.length; index++) {
    total += distribution.probs[index];

    if (total >= q - 1e-9) {
      return distribution.min + index;
    }
  }

  return distribution.min + distribution.probs.length - 1;
}

export function chanceOf(distribution: StatDistribution, value: number): number {
  return distribution.probs[value - distribution.min] ?? 0;
}

export interface Ranking {
  below: number;
  equal: number;
  percentile: number;
}

export function rankOf(distribution: StatDistribution, value: number): Ranking {
  let below = 0;

  distribution.probs.forEach((chance, index) => {
    if (distribution.min + index < value) {
      below += chance;
    }
  });

  const equal = chanceOf(distribution, value);

  return { below, equal, percentile: (below + equal / 2) * 100 };
}

export function compareDistributions(a: StatDistribution, b: StatDistribution): { win: number; tie: number } {
  let win = 0;
  let tie = 0;
  const cumulative: number[] = [];

  b.probs.reduce((sum, value, index) => (cumulative[index] = sum + value), 0);

  a.probs.forEach((chance, index) => {
    const value = a.min + index;
    const lower = Math.min(value - b.min - 1, b.probs.length - 1);

    win += chance * (lower >= 0 ? cumulative[lower] : 0);
    tie += chance * chanceOf(b, value);
  });

  return { win, tie };
}

import { Item } from './equipment';
import {
  CLASS_LEVEL_CONFIGS,
  capBaseStats,
  MAX_BASE_STATS,
  ClassLevelConfig,
  GrowthRates,
  Mount,
  mountGrowthAt,
  MountType,
  scaleGrowth,
  SkillKey,
  STAT_KEYS,
  sumGrowth,
  toGrowth,
  Unit,
  UnitClass,
} from './growth.models';

// --- how a unit's recruitment file looks (src/app/data/recruitment/*.json) -----

export interface RawAbility {
  Name: string;
  Description: string;
}

export interface RawRecruitment {
  UnitId: string;
  PersonalAbility: RawAbility | null;
  Bloodmark: RawAbility | null;
  LevelUpPersonalAbilities: (RawAbility & { LevelAcquired: number })[] | null;
  Blaze?: RawBlaze | null;
  Paths: RawPath[];
}

export interface RawBlazeArt extends RawAbility {
  Atk?: string | null;
  DamageType?: string | null;
  Hit?: string | null;
  Crit?: string | null;
  Rng?: string | null;
  BlazeCost?: string | null;
  HpCost?: string | null;
  LevelGained?: string | null;
  EffectiveType?: string[] | null;
  Req?: string | null;
}

export interface RawBlaze {
  BlazeType: { Type: string; Description: string } | null;
  BlazeAbility: RawAbility | null;
  BlazeArts: RawBlazeArt[] | null;
  ManageBlaze?: RawAbility | null;
  Source?: { Name: string; Description: string; StatBonus?: { StatType: string; Bonus: number } | null } | null;
}

export interface RawPath {
  Path: string;
  IsRecruitable: boolean;
  Requirement: { SupportLv: number; RenownLv: number; RecruitmentNegotiation: string } | null;
  Chapters: RawChapter[];
}

export interface RawChapter {
  Chapter: number;
  Level: number;
  ClassName: string;
  SkillRanks: Record<string, string> | null;
  Inventory: Record<string, RawInventoryItem[] | null> | null;
  Stats: Record<string, number> | null;
  EquippedAbilities: RawAbility[] | null;
}

export interface RawInventoryItem extends Record<string, unknown> {
  Name: string;
  Description: string;
  WeaponType?: string;
  MagicType?: string;
  Durability?: string;
  Uses?: number | string;
  EffectiveType?: string[] | null;
  Mt?: number | string;
  Pwr?: number | string;
  Hit?: number | string;
  Crit?: number | string;
  Curse?: string;
  Wt?: number | string;
  Avo?: number | string;
  Range?: string;
  Skills?: Item['Skills'] | null;
  Skill?: Item['Skills'][number] | null;
  BonusStats?: Item['BonusStats'];
  BonusStat?: Item['BonusStat'];
}

// --- what the character page works with ---------------------------------------

export interface Ability {
  name: string;
  description: string;
}

export interface BlazeArt extends Ability {
  atk: string | null;
  damageType: string | null;
  hit: string | null;
  crit: string | null;
  range: string | null;
  blazeCost: string | null;
  hpCost: string | null;
  levelGained: string | null;
  effectiveType: readonly string[];
  req: string | null;
}

export interface BlazeInfo {
  type: { name: string; description: string } | null;
  ability: Ability | null;
  arts: readonly BlazeArt[];
  manage: Ability | null;
  source: { name: string; description: string; statBonus: { stat: string; bonus: number } | null } | null;
}

export interface LevelUpAbility extends Ability {
  level: number;
}

export interface RouteRequirement {
  supportLevel: number;
  renownLevel: number;
  negotiation: string;
}

export interface InventoryEntry {
  item?: Item;
  name: string;
  description: string;
  values: Readonly<Record<string, string>>;
}

export interface InventoryGroup {
  label: string;
  columns: readonly string[];
  entries: readonly InventoryEntry[];
}

export interface RecruitmentChapter {
  chapter: number;
  level: number;
  className: string;
  skillRanks: Readonly<Partial<Record<SkillKey, string>>>;
  stats: GrowthRates;
  inventory: readonly InventoryGroup[];
  equippedAbilities: readonly Ability[];
}

export interface RecruitmentRoute {
  key: string;
  label: string;
  recruitable: boolean;
  requirement: RouteRequirement | null;
  chapters: readonly RecruitmentChapter[];
}

export interface UnitRecruitment {
  unitName: string;
  personalAbility: Ability | null;
  bloodmark: Ability | null;
  levelUpAbilities: readonly LevelUpAbility[];
  blaze: BlazeInfo | null;
  routes: readonly RecruitmentRoute[];
}

// --- rules for the numbers the files don't give directly -------------------------

export const BASE_MOVE = 4;

export function buildFromStrength(strength: number): number {
  return Math.max(1, Math.floor(strength / 5));
}

export const SIGNATURE_MOUNTS: Readonly<Record<string, { mount: string; bondLevel: number }>> = {
  Alexandra: { mount: 'Bucephalus', bondLevel: 3 },
  Io: { mount: 'Rocinan', bondLevel: 3 },
};

export interface ChapterGrowth {
  growth: GrowthRates;
  mount: { name: string; bondLevel: number } | null;
}

export function chapterGrowth(
  unit: Unit,
  unitClass: UnitClass,
  classMountType: MountType,
  mounts: readonly Mount[],
): ChapterGrowth {
  const config = CLASS_LEVEL_CONFIGS[unitClass.name] ?? null;
  const levelBonus = toGrowth(config ? config.bonuses[config.defaultLevel] : null);
  const signature = SIGNATURE_MOUNTS[unit.name] ?? null;
  const mount = signature
    ? (mounts.find((candidate) => candidate.name === signature.mount && candidate.type === classMountType) ?? null)
    : null;
  const mountGrowth = mount && signature
    ? scaleGrowth(mountGrowthAt(mount, signature.bondLevel), config?.mountMultiplier ?? 1)
    : toGrowth(null);

  return {
    growth: sumGrowth(toGrowth(unit), toGrowth(unitClass), levelBonus, mountGrowth),
    mount: mount && signature ? { name: mount.name, bondLevel: signature.bondLevel } : null,
  };
}

export function routeLabel(key: string): string {
  return key.replace(/([a-z])([A-Z])/g, '$1 $2');
}

// --- stat projection ------------------------------------------------------------

export interface ClassStep {
  fromLevel: number;
  classId: number;
}

export function classAtLevel(steps: readonly ClassStep[], level: number): number | null {
  return stepAtLevel(steps, level)?.classId ?? null;
}

export function stepAtLevel<T extends { fromLevel: number }>(steps: readonly T[], level: number): T | null {
  let found: T | null = null;

  for (const step of steps) {
    if (step.fromLevel <= level && (found === null || step.fromLevel >= found.fromLevel)) {
      found = step;
    }
  }

  return found;
}

export function classLevelGate(config: ClassLevelConfig, unitLevel: number): number {
  return [...config.levels].sort((a, b) => a - b).filter((gate) => gate <= unitLevel).at(-1) ?? config.levels[0];
}

export function levelUpGrowth(
  unit: Unit,
  unitClass: UnitClass,
  unitLevel: number,
  mount: Mount | null,
  bondLevel: number | null,
): GrowthRates {
  const config = CLASS_LEVEL_CONFIGS[unitClass.name] ?? null;
  const levelBonus = toGrowth(config ? config.bonuses[classLevelGate(config, unitLevel)] : null);
  const mountGrowth = mount
    ? scaleGrowth(mountGrowthAt(mount, bondLevel), config?.mountMultiplier ?? 1)
    : toGrowth(null);

  return sumGrowth(toGrowth(unit), toGrowth(unitClass), levelBonus, mountGrowth);
}

export function projectStats(
  start: GrowthRates,
  startLevel: number,
  endLevel: number,
  growthAt: (level: number) => GrowthRates | null,
  gainsAt?: (level: number) => GrowthRates | null,
): GrowthRates {
  const result = capBaseStats(start);

  for (let level = startLevel; level < endLevel; level++) {
    const growth = growthAt(level);

    if (growth) {
      for (const stat of STAT_KEYS) {
        result[stat] = Math.min(MAX_BASE_STATS[stat], result[stat] + growth[stat] / 100);
      }
    }
    const gains = gainsAt?.(level + 1);
    if (gains) {
      for (const stat of STAT_KEYS) result[stat] = Math.min(MAX_BASE_STATS[stat], result[stat] + gains[stat]);
    }
  }

  return result;
}

import { Injectable } from '@angular/core';
import { RECRUITMENT_FILES } from '../data/recruitment';
import { characterKey, SKILL_KEYS, SkillKey, STAT_KEYS, toGrowth } from '../models/growth.models';
import { Item, ITEMS } from '../models/equipment';
import {
  InventoryEntry,
  InventoryGroup,
  RawAbility,
  RawBlaze,
  RawChapter,
  RawPath,
  RawRecruitment,
  RawInventoryItem,
  RecruitmentChapter,
  RecruitmentRoute,
  routeLabel,
  UnitRecruitment,
} from '../models/recruitment.models';

type Row = Record<string, unknown>;

const INVENTORY_LAYOUT: readonly {
  key: string;
  label: string;
  columns: readonly [label: string, value: (row: Row) => unknown][];
}[] = [
  {
    key: 'Weapons',
    label: 'Weapons',
    columns: [
      ['Rank', (row) => skillRank(row['Skill'])],
      ['Uses', (row) => row['Durability']],
      ['Mt', (row) => row['Mt']],
      ['Hit', (row) => row['Hit']],
      ['Crit', (row) => row['Crit']],
      ['Wt', (row) => row['Wt']],
      ['Avo', (row) => row['Avo']],
      ['Rng', (row) => row['Range']],
      ['Curse', (row) => row['Curse']],
      ['Effective', (row) => row['EffectiveType']],
    ],
  },
  {
    key: 'MagicTomes',
    label: 'Black Magic',
    columns: [
      ['Uses', (row) => row['Uses']],
      ['Mt', (row) => row['Mt']],
      ['Hit', (row) => row['Hit']],
      ['Crit', (row) => row['Crit']],
      ['Wt', (row) => row['Wt']],
      ['Avo', (row) => row['Avo']],
      ['Rng', (row) => row['Range']],
      ['Curse', (row) => row['Curse']],
    ],
  },
  {
    key: 'WhiteTomes',
    label: 'White Magic',
    columns: [
      ['Uses', (row) => row['Uses']],
      ['Pwr', (row) => row['Pwr']],
      ['Hit', (row) => row['Hit']],
      ['Crit', (row) => row['Crit']],
      ['Wt', (row) => row['Wt']],
      ['Avo', (row) => row['Avo']],
      ['Rng', (row) => row['Range']],
      ['Curse', (row) => row['Curse']],
    ],
  },
  {
    key: 'CombatArts',
    label: 'Combat Arts',
    columns: [
      ['Type', (row) => row['SkillType']],
      ['Cost', (row) => row['Cost']],
      ['Mt', (row) => row['Mt']],
      ['Hit', (row) => row['Hit']],
      ['Crit', (row) => row['Crit']],
      ['Rng', (row) => row['Rng']],
    ],
  },
  {
    key: 'Items',
    label: 'Items',
    columns: [
      ['Uses', (row) => row['Durability']],
      ['Mt', (row) => row['Mt']],
      ['Hit', (row) => row['Hit']],
      ['Crit', (row) => row['Crit']],
      ['Wt', (row) => row['Wt']],
      ['Avo', (row) => row['Avo']],
      ['Rng', (row) => row['Range']],
    ],
  },
];

@Injectable({ providedIn: 'root' })
export class RecruitmentDataService {
  private readonly byUnit = new Map(
    (RECRUITMENT_FILES as RawRecruitment[]).map((file) => [file.UnitId, toRecruitment(file)]),
  );

  forUnit(unitName: string): UnitRecruitment | null {
    return this.byUnit.get(characterKey(unitName)) ?? null;
  }

  routesWithChapters(unitName: string): readonly RecruitmentRoute[] {
    return this.forUnit(unitName)?.routes.filter((route) => route.chapters.length > 0) ?? [];
  }
}

function toRecruitment(file: RawRecruitment): UnitRecruitment {
  return {
    unitName: file.UnitId,
    personalAbility: toAbility(file.PersonalAbility),
    bloodmark: toAbility(file.Bloodmark),
    levelUpAbilities: (file.LevelUpPersonalAbilities ?? [])
      .map((ability) => ({ ...toAbility(ability)!, level: ability.LevelAcquired }))
      .sort((a, b) => a.level - b.level),
    blaze: toBlaze(file.Blaze),
    routes: (file.Paths ?? []).map(toRoute),
  };
}

function toBlaze(blaze: RawBlaze | null | undefined): UnitRecruitment['blaze'] {
  if (!blaze) {
    return null;
  }

  return {
    type: blaze.BlazeType ? { name: blaze.BlazeType.Type, description: blaze.BlazeType.Description } : null,
    ability: toAbility(blaze.BlazeAbility),
    arts: (blaze.BlazeArts ?? []).map((art) => ({
      name: art.Name,
      description: art.Description,
      atk: art.Atk ?? null,
      damageType: art.DamageType ?? null,
      hit: art.Hit ?? null,
      crit: art.Crit ?? null,
      range: art.Rng ?? null,
      blazeCost: art.BlazeCost ?? null,
      hpCost: art.HpCost ?? null,
      levelGained: art.LevelGained ?? null,
      effectiveType: art.EffectiveType ?? [],
      req: art.Req ?? null,
    })),
    manage: toAbility(blaze.ManageBlaze),
    source: blaze.Source
      ? {
          name: blaze.Source.Name,
          description: blaze.Source.Description,
          statBonus: blaze.Source.StatBonus
            ? { stat: blaze.Source.StatBonus.StatType, bonus: blaze.Source.StatBonus.Bonus }
            : null,
        }
      : null,
  };
}

function toRoute(path: RawPath): RecruitmentRoute {
  const requirement = path.Requirement;

  return {
    key: path.Path,
    label: routeLabel(path.Path),
    recruitable: path.IsRecruitable,
    requirement: requirement
      ? {
          supportLevel: requirement.SupportLv,
          renownLevel: requirement.RenownLv,
          negotiation: requirement.RecruitmentNegotiation,
        }
      : null,
    chapters: (path.Chapters ?? []).map(toChapter).sort((a, b) => a.chapter - b.chapter),
  };
}

function toChapter(chapter: RawChapter): RecruitmentChapter {
  const skillRanks: Partial<Record<SkillKey, string>> = {};

  for (const [key, rank] of Object.entries(chapter.SkillRanks ?? {})) {
    const skill = (key.charAt(0).toLowerCase() + key.slice(1)) as SkillKey;

    if (SKILL_KEYS.includes(skill) && rank) {
      skillRanks[skill] = rank;
    }
  }

  const stats = Object.fromEntries(
    Object.entries(chapter.Stats ?? {}).map(([key, value]) => [key.toLowerCase(), value]),
  );

  return {
    chapter: chapter.Chapter,
    level: chapter.Level,
    className: chapter.ClassName,
    skillRanks,
    stats: toGrowth(Object.fromEntries(STAT_KEYS.map((stat) => [stat, stats[stat] ?? 0]))),
    inventory: toInventory(chapter.Inventory ?? {}),
    equippedAbilities: (chapter.EquippedAbilities ?? []).map((ability) => toAbility(ability)!),
  };
}

function toInventory(inventory: Record<string, RawInventoryItem[] | null>): InventoryGroup[] {
  return INVENTORY_LAYOUT.map(({ key, label, columns }) => {
    const rows = inventory[key] ?? [];
    const entries: InventoryEntry[] = rows.map((row) => ({
      ...(key === 'CombatArts' ? {} : { item: recruitmentItem(row, key) }),
      name: String(row['Name'] ?? ''),
      description: String(row['Description'] ?? ''),
      values: Object.fromEntries(columns.map(([column, value]) => [column, display(value(row))])),
    }));

    return {
      label,
      columns: columns
        .map(([column]) => column)
        .filter((column) => entries.some((entry) => entry.values[column] !== '')),
      entries,
    };
  }).filter((group) => group.entries.length > 0);
}

function recruitmentItem(row: RawInventoryItem, category: string): Item {
  const catalog = ITEMS.find((item) => item.Name === row.Name);
  const skills = row.Skills ?? (row.Skill ? [row.Skill] : catalog?.Skills ?? []);
  const type = row.WeaponType ?? catalog?.WeaponType ??
    (category === 'MagicTomes' ? 'Black Magic' : category === 'WhiteTomes' ? 'White Magic' :
      skills[0]?.SkillType ?? 'Item');

  return {
    Name: row.Name,
    Description: row.Description ?? catalog?.Description ?? '',
    WeaponType: type,
    Durability: row.Durability ?? (row.Uses == null ? catalog?.Durability ?? '--' : String(row.Uses)),
    EffectiveType: row.EffectiveType ?? catalog?.EffectiveType ?? [],
    Mt: row.Mt ?? catalog?.Mt ?? '--',
    ...(row.Pwr === undefined ? {} : { Pwr: row.Pwr }),
    Hit: row.Hit ?? catalog?.Hit ?? '--',
    Crit: row.Crit ?? catalog?.Crit ?? '--',
    Curse: row.Curse ?? catalog?.Curse ?? '--',
    Wt: row.Wt ?? catalog?.Wt ?? '--',
    Avo: row.Avo ?? catalog?.Avo ?? '--',
    Range: row.Range ?? catalog?.Range ?? '--',
    Skills: skills,
    BonusStats: row.BonusStats ?? row.BonusStat ?? catalog?.BonusStats ?? catalog?.BonusStat ?? null,
  };
}

function toAbility(ability: RawAbility | readonly unknown[] | null | undefined): { name: string; description: string } | null {
  return ability && !Array.isArray(ability) && (ability as RawAbility).Name
    ? { name: (ability as RawAbility).Name, description: (ability as RawAbility).Description }
    : null;
}

function skillRank(skill: unknown): string {
  const value = skill as { SkillType?: string; SkillRank?: string } | null;

  return value?.SkillType ? `${value.SkillType} ${value.SkillRank ?? ''}`.trim() : '';
}

function display(value: unknown): string {
  if (value === null || value === undefined || value === '--') {
    return '';
  }

  return Array.isArray(value) ? value.join(', ') : String(value);
}

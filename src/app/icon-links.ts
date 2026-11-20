import data from './data/icon-links.json';
import { SkillKey, SkillPreference } from './models/growth.models';

const LINKS = data as unknown as {
  characters: Record<string, string>;
  classSprites: Record<string, string | null>;
  skills: Record<SkillKey, Record<SkillPreference, string | null>>;
};

export function portraitUrl(name: string): string | null {
  return LINKS.characters[name] ?? null;
}

export function classSpriteUrl(name: string): string | null {
  return LINKS.classSprites[name] ?? null;
}

const CLASS_ICON_SLUGS = new Set(`
  archer armored_knight armored_ornius_rider bardinger battlemaster bau_lord bishop
  blacksmith bow_adept bow_knight brigand caladrius castle_knight cataphract
  celestial_trooper charioteer commoner dancer diviner dragoon dreadnought druid
  elephant_rider forest_knight gladiator great_knight guardian high_savant hunter
  light_cavalry myrmidon noble orichaldia ornius_rider ovate priest pugilist ranger
  rogue sentinel shadow_seeker shaman shido sniper soldier swordmaster
  the_apsara the_avatar the_blade the_calamity the_cavalier the_eternal the_godhand
  the_trident troubadour valkyrium war_monk warrior wing_soldier wiseman
`.trim().split(/\s+/));

export function classIcons(name: string): { label: string; src: string }[] {
  const slug = name === 'Winged Soldier' ? 'wing_soldier' : name.toLowerCase().replace(/ /g, '_');
  if (!CLASS_ICON_SLUGS.has(slug)) {
    return [];
  }

  const genders = slug === 'wing_soldier' || slug === 'celestial_trooper'
    ? ['Female'] as const
    : ['Male', 'Female'] as const;

  return genders.map((label) => ({
    label,
    src: `icons/classes/${slug}__${slug.startsWith('the_') ? `variant_${label === 'Male' ? 1 : 2}` : label.toLowerCase()}.png`,
  }));
}

export function abilityIconUrl(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  return `https://eoddb.com/fefw/img/abilities/${slug}.webp?v=3`;
}

export function skillIconUrl(skill: SkillKey, preference: SkillPreference = 'neutral'): string | null {
  return LINKS.skills[skill]?.[preference] ?? null;
}

export function useFallbackIcon(event: Event, fallback: string): void {
  const img = event.target as HTMLImageElement;

  if (!img.src.endsWith(fallback)) {
    img.src = fallback;
  }
}

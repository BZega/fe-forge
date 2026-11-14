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

// Same naming scheme as the class sprites: "Sword Crit +3" -> sword_crit_3.webp. Unverified, so callers fall back on error.
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

/** Swaps a linked image that fails to load (e.g. the host is blocked) for a bundled one. */
export function useFallbackIcon(event: Event, fallback: string): void {
  const img = event.target as HTMLImageElement;

  if (!img.src.endsWith(fallback)) {
    img.src = fallback;
  }
}

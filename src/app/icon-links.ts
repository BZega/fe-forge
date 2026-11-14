import data from './data/icon-links.json';
import { SkillKey, SkillPreference } from './models/growth.models';

// Hosted on the Fire Emblem Wiki (Fandom); see data/icon-links.json.
const LINKS = data as unknown as {
  characters: Record<string, string>;
  classSprites: Record<string, string | null>;
  // Keyed by ability name; filled in by tools/find-class-icons.js --write.
  abilityIcons: Record<string, string | null>;
  skills: Record<SkillKey, Record<SkillPreference, string | null>>;
};

export function portraitUrl(name: string): string | null {
  return LINKS.characters[name] ?? null;
}

export function classSpriteUrl(name: string): string | null {
  return LINKS.classSprites[name] ?? null;
}

export function abilityIconUrl(name: string): string | null {
  return LINKS.abilityIcons[name] ?? null;
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

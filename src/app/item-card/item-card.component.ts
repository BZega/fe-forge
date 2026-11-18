import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { skillIconUrl, useFallbackIcon } from '../icon-links';
import { Item, itemBaseName, itemBonusDescription } from '../models/equipment';
import { SKILL_KEYS, SKILL_LABELS, SkillKey } from '../models/growth.models';

@Component({
  selector: 'app-item-card',
  templateUrl: './item-card.component.html',
  styleUrl: './item-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ItemCardComponent {
  readonly item = input.required<Item>();
  readonly selectable = input(false);
  readonly selected = input(false);
  readonly disabled = input(false);
  readonly disclosureGroup = input<string | null>(null);
  readonly selectionChange = output<void>();
  readonly variants = input<readonly Item[]>([]);
  readonly variantChange = output<string>();
  readonly baseName = computed(() => itemBaseName(this.item().Name));
  readonly canUpgrade = computed(() => this.selectable() && this.variants().length > 1);
  readonly namedVariant = computed(() => this.variantLabel(this.item()).length > 0 && !this.variantLabel(this.item()).startsWith('+'));
  readonly variantWidth = computed(() => this.namedVariant() ? `${this.variantLabel(this.item()).length + 1}ch` : null);
  readonly itemBonusDescription = itemBonusDescription;
  readonly useFallbackIcon = useFallbackIcon;
  readonly hasCombatDetails = computed(() => {
    const item = this.item();
    return item.Skills.length > 0 ||
      [item.Pwr ?? item.Mt, item.Hit, item.Crit, item.Curse, item.Wt, item.Avo, item.Range]
        .some((value) => typeof value === 'number' || (value.trim() !== '' && value.trim() !== '--'));
  });
  readonly effectiveness = computed(() => this.item().EffectiveType.map((value) => {
    const raw = value.trim();
    const enhanced = /^extra/i.test(raw) || /^effective\s*\+/i.test(raw);
    const target = raw.replace(/^(?:extra|effective\s*\+?)\s*/i, '')
      .replace(/([a-z])([A-Z])/g, '$1 $2').trim();
    const label = `${enhanced ? 'Effective+' : 'Effective'} ${target}`;
    return { target, label, enhanced, title: `${label}: ${enhanced ? 3 : 2}x weapon Might` };
  }));

  variantLabel(item: Item): string {
    return item.Name.slice(itemBaseName(item.Name).length).trim();
  }

  skillKey(type: string): SkillKey | null {
    const normalized = type.toLowerCase();
    return SKILL_KEYS.find((key) =>
      key.toLowerCase() === normalized || SKILL_LABELS[key].toLowerCase() === normalized ||
      (key === 'gauntlet' && normalized === 'gauntlets'),
    ) ?? null;
  }

  fallbackIcon(key: SkillKey): string {
    return `icons/skills/black/${key}.svg`;
  }

  icon(key: SkillKey): string {
    return skillIconUrl(key) ?? this.fallbackIcon(key);
  }
}

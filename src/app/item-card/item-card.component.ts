import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { equipmentIconUrl, skillIconUrl, useFallbackIcon } from '../icon-links';
import { Item, itemBaseName, itemBonusDescription } from '../models/equipment';
import { SKILL_KEYS, SKILL_LABELS, SkillKey } from '../models/growth.models';

const EFFECTIVENESS_ICONS: Readonly<Record<string, string>> = {
  armor: 'effective_armor',
  beast: 'effective_beast',
  cavalry: 'effective_cavalry',
  dragon: 'effective_dragon',
  flying: 'effective_flying',
  undead: 'effective_undead',
  extraarmor: 'extra_effective_armor',
  extracavalry: 'extra_effective_cavalry',
  extraflying: 'extra_effective_flying',
  extraundead: 'extra_effective_undead',
};

@Component({
  selector: 'app-item-card',
  imports: [NgTemplateOutlet],
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
  readonly showVariants = input(false);
  readonly alwaysExpanded = input(false);
  readonly showBonusStats = input(true);
  readonly highlightUpgrades = input(false);
  readonly variantChange = output<string>();
  readonly baseName = computed(() => itemBaseName(this.item().Name));
  readonly displayBaseName = computed(() => this.variantLabel(this.item()) === 'Charm'
    ? this.item().Name.slice(0, -' Charm'.length) : this.baseName());
  readonly canUpgrade = computed(() => (this.selectable() || this.showVariants()) && this.variants().length > 1);
  readonly namedVariant = computed(() => this.variantLabel(this.item()).length > 0 && !this.variantLabel(this.item()).startsWith('+'));
  readonly variantWidth = computed(() => this.namedVariant() ? `${this.variantLabel(this.item()).length + 1}ch` : null);
  readonly itemBonusDescription = itemBonusDescription;
  readonly useFallbackIcon = useFallbackIcon;
  readonly equipmentIcon = computed(() => equipmentIconUrl(this.item(), !this.selectable() || this.selected()));
  readonly improvedFields = computed(() => {
    const improved = new Set<string>();
    const item = this.item();
    const base = this.variants().find((variant) => variant.Name === itemBaseName(item.Name));
    if (!this.highlightUpgrades() || !base || base.Name === item.Name) return improved;
    const durability = (value: string): number | null => {
      const match = /^\s*\d+\s*\/\s*(\d+)\s*$/.exec(value);
      return match ? Number(match[1]) : null;
    };
    const currentDurability = durability(item.Durability);
    const baseDurability = durability(base.Durability);
    if (currentDurability !== null && baseDurability !== null && currentDurability > baseDurability) {
      improved.add('Durability');
    }
    for (const field of ['Mt', 'Hit', 'Crit', 'Wt', 'Avo', 'Range'] as const) {
      const current = field === 'Mt' ? item.Pwr ?? item.Mt : item[field];
      const original = field === 'Mt' ? base.Pwr ?? base.Mt : base[field];
      const numeric = (value: string | number) => typeof value === 'number' || /^\d+(?:\.\d+)?$/.test(value.trim());
      if (numeric(current) && numeric(original) &&
          (field === 'Wt' ? Number(current) < Number(original) : Number(current) > Number(original))) {
        improved.add(field);
      }
    }
    return improved;
  });
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
    const iconName = EFFECTIVENESS_ICONS[`${enhanced ? 'extra' : ''}${target.toLowerCase()}`];
    return {
      target, label, enhanced, title: `${label}: ${enhanced ? 3 : 2}x weapon Might`,
      icon: iconName ? `icons/effective/${iconName}.png` : null,
    };
  }));

  variantLabel(item: Item): string {
    if (item.Name.endsWith(' Charm') && itemBaseName(item.Name) !== item.Name) return 'Charm';
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

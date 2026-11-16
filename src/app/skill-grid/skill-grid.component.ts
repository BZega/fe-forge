import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { skillIconUrl, useFallbackIcon } from '../icon-links';
import { SkillKey, SkillPreference } from '../models/growth.models';

export interface SkillGridItem {
  key: SkillKey;
  label: string;
  value: string;
  usable: boolean;
  preference?: SkillPreference;
  description?: string;
}

@Component({
  selector: 'app-skill-grid',
  imports: [NgTemplateOutlet],
  template: `
    <ul class="skill-grid">
      @for (skill of items(); track skill.key) {
        @if (interactive()) {
          <li>
            <button type="button" class="skill-rank skill skill-rank--usable" [attr.aria-label]="skill.description ?? skill.label"
              [title]="skill.label" (click)="selected.emit(skill.key)">
              <ng-container [ngTemplateOutlet]="content" [ngTemplateOutletContext]="{ $implicit: skill }" />
              @if (active() === skill.key) {
                <span class="skill-tip" aria-hidden="true">{{ skill.label }}</span>
              }
            </button>
          </li>
        } @else {
          <li class="skill-rank" [class.skill-rank--usable]="skill.usable" [title]="skill.label + (skill.usable ? '' : ' (not usable)')">
            <ng-container [ngTemplateOutlet]="content" [ngTemplateOutletContext]="{ $implicit: skill }" />
          </li>
        }
      }
    </ul>
    <ng-template #content let-skill>
      <img class="skill-rank-icon" [src]="icon(skill)" [attr.data-skill]="skill.key" alt="" referrerpolicy="no-referrer"
        (error)="useFallbackIcon($event, fallback(skill))" />
      <span class="skill-rank-label">{{ skill.label }}</span>
      <span class="skill-rank-value">{{ skill.value }}</span>
    </ng-template>
  `,
  styleUrl: './skill-grid.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SkillGridComponent {
  readonly items = input.required<readonly SkillGridItem[]>();
  readonly interactive = input(false);
  readonly active = input<SkillKey | null>(null);
  readonly selected = output<SkillKey>();
  readonly useFallbackIcon = useFallbackIcon;

  fallback(skill: SkillGridItem): string {
    const color = skill.preference === 'good' ? 'gold' : skill.preference === 'bad' ? 'silver' : 'black';
    return `icons/skills/${color}/${skill.key}.svg`;
  }

  icon(skill: SkillGridItem): string {
    return skillIconUrl(skill.key, skill.preference) ?? this.fallback(skill);
  }
}
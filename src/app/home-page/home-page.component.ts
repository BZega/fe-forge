import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { skillIconUrl, useFallbackIcon } from '../icon-links';
import { SkillKey } from '../models/growth.models';
import { RESOURCE_LINKS, TOOL_LINKS } from '../nav-links';
import { SPOILER_TIERS, SpoilerService, SpoilerTier } from '../services/spoiler.service';
import { SupportDialogComponent } from '../support-dialog/support-dialog.component';

@Component({
  selector: 'app-home-page',
  imports: [RouterLink, SupportDialogComponent],
  templateUrl: './home-page.component.html',
  styleUrl: './home-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomePageComponent {
  private readonly spoilers = inject(SpoilerService);

  readonly tools = TOOL_LINKS;
  readonly resources = RESOURCE_LINKS;
  readonly supportOpen = signal(false);
  readonly useFallbackIcon = useFallbackIcon;

  cardIcon(skill: SkillKey): string {
    return skillIconUrl(skill, 'good') ?? this.localIcon(skill);
  }

  localIcon(skill: SkillKey): string {
    return `icons/skills/gold/${skill}.svg`;
  }
  readonly spoilerTiers = SPOILER_TIERS;
  readonly hiddenTiers = this.spoilers.hiddenTiers;
  readonly allHidden = this.spoilers.allHidden;

  toggleAllSpoilers(): void {
    this.spoilers.toggleAll();
  }

  toggleSpoilerTier(tier: SpoilerTier): void {
    this.spoilers.toggle(tier);
  }
}

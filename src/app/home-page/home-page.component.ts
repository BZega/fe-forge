import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { RESOURCE_LINKS, TOOL_LINKS } from '../nav-links';
import { SupportDialogComponent } from '../support-dialog/support-dialog.component';

@Component({
  selector: 'app-home-page',
  imports: [RouterLink, SupportDialogComponent],
  templateUrl: './home-page.component.html',
  styleUrl: './home-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomePageComponent {
  readonly tools = TOOL_LINKS;
  readonly resources = RESOURCE_LINKS;
  readonly supportOpen = signal(false);
}

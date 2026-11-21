import { afterNextRender, Component, computed, DestroyRef, ElementRef, HostListener, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs/operators';
import { SPOILER_TIERS, SpoilerService, SpoilerTier } from './services/spoiler.service';
import { RESOURCE_LINKS, TOOL_LINKS } from './nav-links';
import { SuggestionDialogComponent } from './suggestion-dialog/suggestion-dialog.component';
import { SpoilerNoticeComponent } from './spoiler-notice/spoiler-notice.component';
import { GrowthDataService } from './services/growth-data.service';

const TEXT_FIELD = 'input:not([type=checkbox]):not([type=radio]):not([type=button]), textarea, select';
const KEYBOARD_KEY = 'fe-forge:keyboard-inset';
const MARGIN = 8;
const SPOILER_NOTICE_KEY = 'fe-forge.spoiler-notice-dismissed';

const isEditing = () => document.activeElement?.matches(TEXT_FIELD) ?? false;

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, SuggestionDialogComponent, SpoilerNoticeComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {
  private readonly spoilers = inject(SpoilerService);
  private readonly router = inject(Router);
  private readonly data = inject(GrowthDataService);
  private readonly noticeUnits = toSignal(this.data.getUnits(), { initialValue: [] });
  private readonly noticeClasses = toSignal(this.data.getClasses(), { initialValue: [] });
  private readonly noticeMounts = toSignal(this.data.getMounts(), { initialValue: [] });
  private readonly noticeSuppressed = signal(readSpoilerNoticePreference());
  private readonly dismissedVisit = signal<number | null>(null);
  private readonly visit = toSignal(this.router.events.pipe(
    filter((event): event is NavigationEnd => event instanceof NavigationEnd),
    map((event) => ({ id: event.id, data: this.spoilerRouteData() })),
  ), { initialValue: { id: 0, data: this.spoilerRouteData() } });
  private readonly hasMissingSpoilerData = computed(() => {
    const source = this.visit().data;
    const hidden = (items: readonly { name: string; rank?: string }[]) =>
      items.some((item) => this.spoilers.isSpoiler(item));

    switch (source) {
      case 'units': return hidden(this.noticeUnits());
      case 'classes': return hidden(this.noticeClasses());
      case 'mounts': return hidden(this.noticeMounts());
      case 'builds':
        return hidden(this.data.pickableUnits(this.noticeUnits()))
          || hidden(this.noticeClasses()) || hidden(this.noticeMounts());
      default: return false;
    }
  });
  readonly spoilerNoticeError = signal('');
  readonly spoilerNoticeVisible = computed(() =>
    this.hasMissingSpoilerData() && !this.noticeSuppressed()
    && this.dismissedVisit() !== this.visit().id,
  );

  title = 'fe-forge-frontend';

  readonly links = TOOL_LINKS;
  readonly resourceLinks = RESOURCE_LINKS;

  readonly menuOpen = signal(false);
  readonly resourcesOpen = signal(false);
  readonly suggestionsOpen = signal(false);
  readonly hideSpoilers = this.spoilers.hidden;
  readonly hiddenTiers = this.spoilers.hiddenTiers;
  readonly allSpoilersHidden = this.spoilers.allHidden;
  readonly spoilerTiers = SPOILER_TIERS;
  readonly spoilerMenuOpen = signal(false);

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private keyboardInset = readKeyboardInset();

  private spoilerRouteData(): 'units' | 'classes' | 'mounts' | 'builds' | null {
    let route = this.router.routerState.snapshot.root;
    while (route.firstChild) {
      route = route.firstChild;
    }
    const source = route.data['spoilerData'];
    return source === 'units' || source === 'classes' || source === 'mounts' || source === 'builds'
      ? source : null;
  }

  dismissSpoilerNotice(dontTellAgain: boolean): void {
    if (dontTellAgain) {
      try {
        localStorage.setItem(SPOILER_NOTICE_KEY, 'true');
      } catch (error) {
        console.warn('Could not save the spoiler notice preference.', error);
        this.spoilerNoticeError.set("Couldn't save your preference. Try again, or uncheck \"Don't tell me again\" to dismiss.");
        return;
      }
      this.noticeSuppressed.set(true);
    }
    this.spoilerNoticeError.set('');
    this.dismissedVisit.set(this.visit().id);
  }

  constructor() {
    const destroyRef = inject(DestroyRef);

    afterNextRender(() => {
      const viewport = window.visualViewport;
      const host = this.host.nativeElement;
      const scroller = host.querySelector('main');

      if (!viewport || !scroller) {
        return;
      }

      let frame = 0;
      let settle = 0;
      let early = 0;
      const schedule = () => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => this.updateKeyboardInset(viewport));
        clearTimeout(settle);
        settle = window.setTimeout(() => this.placeFocusedField(viewport, false), 200);
      };
      const onFocusIn = () => {
        clearTimeout(early);
        early = window.setTimeout(() => this.placeFocusedField(viewport, true));
        schedule();
      };
      const onFocusOut = (event: FocusEvent) => {
        const select = event.target instanceof Element
          ? event.target.closest('app-searchable-select')
          : null;
        if (event.relatedTarget instanceof Node && select?.contains(event.relatedTarget)) {
          return;
        }

        this.clearDropdownCaps();
        this.trimScrollExtra();
      };
      const onScroll = () => {
        if (!isEditing()) {
          this.trimScrollExtra();
        }
      };
      let touch: { x: number; y: number } | null = null;
      const onTouchStart = (event: TouchEvent) => {
        const point = event.touches.length === 1 ? event.touches[0] : undefined;
        touch = point ? { x: point.clientX, y: point.clientY } : null;
      };
      const onTouchEnd = (event: TouchEvent) => {
        const start = touch;
        const point = event.changedTouches[0];
        touch = null;

        if (!start || !point || Math.hypot(point.clientX - start.x, point.clientY - start.y) > 10) {
          return;
        }

        const input = dropdownInputAt(event.target);

        if (input && this.openDropdownAboveKeyboard(viewport, input)) {
          event.preventDefault();
        }
      };
      const contentObserver = new MutationObserver(() => {
        if (isEditing()) {
          schedule();
        } else {
          this.clearDropdownCaps();
          this.trimScrollExtra();
        }
      });
      contentObserver.observe(host, { childList: true, subtree: true, characterData: true });

      viewport.addEventListener('resize', schedule);
      viewport.addEventListener('scroll', schedule);
      host.addEventListener('focusin', onFocusIn);
      host.addEventListener('focusout', onFocusOut);
      host.addEventListener('touchstart', onTouchStart, { passive: true });
      host.addEventListener('touchend', onTouchEnd, { passive: false });
      scroller.addEventListener('scroll', onScroll, { passive: true });
      destroyRef.onDestroy(() => {
        cancelAnimationFrame(frame);
        clearTimeout(settle);
        clearTimeout(early);
        contentObserver.disconnect();
        viewport.removeEventListener('resize', schedule);
        viewport.removeEventListener('scroll', schedule);
        host.removeEventListener('focusin', onFocusIn);
        host.removeEventListener('focusout', onFocusOut);
        host.removeEventListener('touchstart', onTouchStart);
        host.removeEventListener('touchend', onTouchEnd);
        scroller.removeEventListener('scroll', onScroll);
      });
    });
  }

  private updateKeyboardInset(viewport: VisualViewport): number {
    const host = this.host.nativeElement;
    const zoomed = Math.abs(viewport.scale - 1) >= 0.01;
    const inset = zoomed ? 0 : Math.max(0, Math.round(window.innerHeight - viewport.height));
    const previous = this.cssPixels('--keyboard-inset');

    if (inset > 0) {
      host.style.setProperty('--keyboard-inset', `${inset}px`);
    } else {
      host.style.removeProperty('--keyboard-inset');
    }

    if (inset < previous) {
      this.setScrollExtra(this.cssPixels('--scroll-extra') + previous - inset);

      if (!isEditing()) {
        this.trimScrollExtra();
      }
    }

    return inset;
  }

  private placeFocusedField(viewport: VisualViewport, beforeKeyboard: boolean): void {
    const inset = this.updateKeyboardInset(viewport);
    const field = document.activeElement;
    const scroller = field instanceof HTMLElement ? this.scrollerFor(field) : null;

    if (
      !matchMedia('(pointer: coarse)').matches ||
      Math.abs(viewport.scale - 1) >= 0.01 ||
      !scroller ||
      !(field instanceof HTMLElement) ||
      !field.matches(TEXT_FIELD)
    ) {
      return;
    }

    const predicted = beforeKeyboard && inset === 0 && opensKeyboard(field);

    if (!predicted && inset > 0 && inset !== this.keyboardInset) {
      this.keyboardInset = inset;
      writeKeyboardInset(inset);
    }

    const visible = this.visibleArea(viewport, scroller, predicted);
    const top = field.getBoundingClientRect().top;
    const select = field.closest<HTMLElement>('app-searchable-select');
    const panel = select?.querySelector<HTMLElement>('.panel');

    if (select && panel && beforeKeyboard) {
      capDropdown(select, visible, panel.getBoundingClientRect().top - top);
    }

    const bottom = (panel ?? field).getBoundingClientRect().bottom;
    let delta = 0;

    if (bottom > visible.bottom) {
      delta = Math.min(bottom - visible.bottom, top - visible.top);
    } else if (top < visible.top && beforeKeyboard) {
      delta = top - visible.top;
    }

    if (!beforeKeyboard && delta < 0) {
      return;
    }

    this.scrollBy(scroller, delta, predicted ? 'auto' : 'smooth');
  }

  private openDropdownAboveKeyboard(viewport: VisualViewport, input: HTMLInputElement): boolean {
    const scroller = this.scrollerFor(input);
    const select = input.closest<HTMLElement>('app-searchable-select');

    if (!scroller || !select || Math.abs(viewport.scale - 1) >= 0.01) {
      return false;
    }

    const inset = this.updateKeyboardInset(viewport);
    const visible = this.visibleArea(viewport, scroller, inset === 0 && opensKeyboard(input));
    const top = input.getBoundingClientRect().top;
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const panelTop = select.getBoundingClientRect().bottom + 0.25 * rem;
    const style = getComputedStyle(select);
    const listHeight = (parseFloat(style.getPropertyValue('--dropdown-height')) || 13) * rem;
    const minHeight = (parseFloat(style.getPropertyValue('--dropdown-min-height')) || 8) * rem;
    const height = Math.min(listHeight, Math.max(minHeight, capDropdown(select, visible, panelTop - top)));
    const bottom = panelTop + height;
    let delta = 0;

    if (bottom > visible.bottom) {
      delta = Math.min(bottom - visible.bottom, top - visible.top);
    } else if (top < visible.top) {
      delta = top - visible.top;
    }

    this.scrollBy(scroller, delta, 'auto');
    input.focus({ preventScroll: true });

    return true;
  }

  private visibleArea(viewport: VisualViewport, scroller: HTMLElement, predicted: boolean): VisibleArea {
    const bounds = scroller.getBoundingClientRect();
    const keyboardTop = predicted
      ? window.innerHeight - this.keyboardInset
      : viewport.offsetTop + viewport.height;

    return {
      top: Math.max(viewport.offsetTop, bounds.top) + MARGIN,
      bottom: Math.min(keyboardTop, bounds.bottom) - MARGIN,
    };
  }

  private scrollBy(scroller: HTMLElement, delta: number, behavior: ScrollBehavior): void {
    if (Math.abs(delta) <= 2) {
      return;
    }

    const target = Math.max(0, Math.round(scroller.scrollTop + delta));
    const shortfall = target - (scroller.scrollHeight - scroller.clientHeight);

    if (shortfall > 0 && scroller.matches('main')) {
      this.setScrollExtra(this.cssPixels('--scroll-extra') + shortfall);
    }

    scroller.scrollTo({ top: target, behavior });
  }

  private scrollerFor(field: HTMLElement): HTMLElement | null {
    return (
      field.closest<HTMLElement>('[aria-modal="true"]') ??
      this.host.nativeElement.querySelector('main')
    );
  }
  private clearDropdownCaps(): void {
    this.host.nativeElement
      .querySelectorAll<HTMLElement>('app-searchable-select')
      .forEach((select) => select.style.removeProperty('--dropdown-max-height'));
  }

  private trimScrollExtra(): void {
    const scroller = this.host.nativeElement.querySelector('main');
    const extra = this.cssPixels('--scroll-extra');

    if (!scroller || extra <= 0) {
      return;
    }

    const slack = Math.floor(scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop);
    this.setScrollExtra(Math.max(0, extra - Math.max(0, slack)));
  }

  private setScrollExtra(extra: number): void {
    const host = this.host.nativeElement;

    if (extra > 0) {
      host.style.setProperty('--scroll-extra', `${Math.ceil(extra)}px`);
    } else {
      host.style.removeProperty('--scroll-extra');
    }
  }

  private cssPixels(name: string): number {
    return parseFloat(this.host.nativeElement.style.getPropertyValue(name)) || 0;
  }

  toggleMenu(): void {
    this.menuOpen.update((open) => !open);
  }

  closeMenu(): void {
    this.menuOpen.set(false);
    this.resourcesOpen.set(false);
    this.spoilerMenuOpen.set(false);
  }

  toggleResources(): void {
    this.resourcesOpen.update((open) => !open);
    this.spoilerMenuOpen.set(false);
  }

  toggleSpoilerMenu(): void {
    this.spoilerMenuOpen.update((open) => !open);
    this.resourcesOpen.set(false);
  }

  toggleSpoilerTier(tier: SpoilerTier): void {
    this.spoilers.toggle(tier);
  }

  toggleAllSpoilers(): void {
    this.spoilers.toggleAll();
  }

  openSpoilerSettings(): void {
    this.menuOpen.set(true);
    this.resourcesOpen.set(false);
    this.spoilerMenuOpen.set(true);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (event.target instanceof Element && !event.target.closest('.spoiler-menu, .spoiler-indicator')) {
      this.spoilerMenuOpen.set(false);
    }

    if (event.target instanceof Element && !event.target.closest('.resource-menu')) {
      this.resourcesOpen.set(false);
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.spoilerMenuOpen.set(false);
    this.resourcesOpen.set(false);
  }

  openSuggestions(): void {
    this.closeMenu();
    this.suggestionsOpen.set(true);
  }
}

function readSpoilerNoticePreference(): boolean {
  try {
    return localStorage.getItem(SPOILER_NOTICE_KEY) === 'true';
  } catch (error) {
    console.warn('Could not read the spoiler notice preference.', error);
    return false;
  }
}

function readKeyboardInset(): number {
  try {
    const stored = Number(localStorage.getItem(KEYBOARD_KEY));

    if (stored > 0 && stored < window.innerHeight * 0.8) {
      return stored;
    }
  } catch {
    // Storage can be unavailable.
  }

  return Math.round(window.innerHeight * 0.6);
}

function writeKeyboardInset(inset: number): void {
  try {
    localStorage.setItem(KEYBOARD_KEY, String(inset));
  } catch {
    // Storage can be unavailable; ignore errors.
  }
}

interface VisibleArea {
  top: number;
  bottom: number;
}

function capDropdown(select: HTMLElement, visible: VisibleArea, listOffset: number): number {
  const room = Math.max(0, Math.floor(visible.bottom - visible.top - listOffset));
  select.style.setProperty('--dropdown-max-height', `${room}px`);

  return room;
}

function opensKeyboard(field: HTMLElement): boolean {
  return field.getAttribute('inputmode') !== 'none';
}

function dropdownInputAt(target: EventTarget | null): HTMLInputElement | null {
  const input = target instanceof Element
    ? target.closest('app-searchable-select .field')?.querySelector('input')
    : null;

  return input instanceof HTMLInputElement && !input.disabled && document.activeElement !== input
    ? input
    : null;
}
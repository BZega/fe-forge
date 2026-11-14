import { afterNextRender, ChangeDetectionStrategy, Component, computed, effect, ElementRef, HostListener, inject, Injector, input, output, signal, viewChild } from '@angular/core';

export interface SelectItem {
  id: number;
  name: string;
}

export interface SelectItemGroup {
  label: string;
  items: readonly SelectItem[];
}

@Component({
  selector: 'app-searchable-select',
  templateUrl: './searchable-select.component.html',
  styleUrl: './searchable-select.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SearchableSelectComponent {
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly injector = inject(Injector);

  readonly items = input<readonly SelectItem[]>([]);
  readonly groups = input<readonly SelectItemGroup[]>([]);
  readonly value = input<number | null>(null);
  readonly placeholder = input('— Select —');
  readonly label = input('');
  readonly disabled = input(false);
  readonly clearable = input(true);
  readonly keyboard = input(true);
  readonly focusGroup = input<string | null>(null);

  readonly valueChange = output<number | null>();

  readonly open = signal(false);
  readonly query = signal('');
  readonly typing = signal(false);
  readonly typingMinLength = TYPING_MIN_LENGTH;

  private readonly searchBox =
    viewChild<ElementRef<HTMLInputElement>>('search');

  private readonly allGroups = computed<readonly SelectItemGroup[]>(() => {
    const groups = this.groups();

    return groups.length > 0 ? groups : [{ label: '', items: this.items() }];
  });

  readonly filtered = computed<SelectItemGroup[]>(() => {
    const needle = this.query().trim().toLowerCase();
    const typing = this.typing();

    if (typing && needle.length < TYPING_MIN_LENGTH) {
      return [];
    }

    let room = typing ? TYPING_MAX_RESULTS : Infinity;

    return this.allGroups()
      .map((group) => {
        const items = needle
          ? group.items.filter((item) => item.name.toLowerCase().includes(needle))
          : group.items;
        const kept = items.slice(0, room);
        room -= kept.length;

        return { label: group.label, items: kept };
      })
      .filter((group) => group.items.length > 0);
  });

  readonly flattened = computed<SelectItem[]>(() =>
    this.filtered().flatMap((group) => [...group.items]),
  );

  private readonly allItems = computed<SelectItem[]>(() =>
    this.allGroups().flatMap((group) => [...group.items]),
  );

  readonly selectedName = computed(() => {
    const id = this.value();

    return id === null
      ? null
      : (this.allItems().find((item) => item.id === id)?.name ?? null);
  });

  readonly activeIndex = signal(0);

  private openBeforePress = false;

  constructor() {
    effect(() => {
      const element = this.searchBox()?.nativeElement;

      if (element && !this.open()) {
        element.value = this.selectedName() ?? '';
      }
    });

    effect((onCleanup) => {
      if (!this.open() || !this.inDialog()) {
        return;
      }

      let frame = 0;
      const follow = () => {
        this.followField();
        frame = requestAnimationFrame(follow);
      };
      frame = requestAnimationFrame(follow);
      onCleanup(() => cancelAnimationFrame(frame));
    });
  }

  private panelOrigin = { x: 0, y: 0 };

  private followField(): void {
    this.measureRoom();

    const host = this.host.nativeElement as HTMLElement;
    const panel = host.querySelector<HTMLElement>('.panel');

    if (!panel) {
      return;
    }

    const field = host.getBoundingClientRect();
    const shown = panel.getBoundingClientRect();
    const dx = shown.left - field.left;
    const dy = shown.top - (field.bottom + PANEL_OFFSET);

    if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
      this.panelOrigin = { x: this.panelOrigin.x + dx, y: this.panelOrigin.y + dy };
      this.measureRoom();
    }
  }

  private inDialog(): boolean {
    return (this.host.nativeElement as HTMLElement).closest('[role="dialog"]') !== null;
  }

  openPanel(): void {
    if (this.disabled() || this.open()) {
      return;
    }

    this.open.set(true);
    this.query.set('');
    this.measureRoom();

    const selected = this.flattened().findIndex(
      (item) => item.id === this.value(),
    );
    const focus = selected < 0 ? this.groupStart(this.focusGroup()) : -1;
    this.activeIndex.set(Math.max(selected, focus, 0));
    this.scrollActiveIntoView(focus >= 0);

    const element = this.searchBox()?.nativeElement;

    if (element) {
      element.value = '';
    }
  }

  private measureRoom(): void {
    const host = this.host.nativeElement as HTMLElement;
    const viewport = window.visualViewport;
    const bottom = viewport ? viewport.offsetTop + viewport.height : window.innerHeight;
    const field = host.getBoundingClientRect();
    const room = Math.floor(bottom - field.bottom - LIST_GAP);

    host.style.setProperty('--dropdown-room', `${room}px`);

    if (this.inDialog()) {
      host.setAttribute('data-floating', '');
      host.style.setProperty('--panel-top', `${field.bottom + PANEL_OFFSET - this.panelOrigin.y}px`);
      host.style.setProperty('--panel-left', `${field.left - this.panelOrigin.x}px`);
      host.style.setProperty('--panel-width', `${field.width}px`);
    }
  }

  onFieldPointerDown(): void {
    this.openBeforePress = this.open();
  }

  onFieldClick(event: MouseEvent): void {
    if (this.openBeforePress) {
      if (!this.keyboard() && !this.typing() && event.target === this.searchBox()?.nativeElement) {
        this.startTyping();

        return;
      }

      this.close();

      return;
    }

    this.openPanel();
    this.searchBox()?.nativeElement.focus();
  }

  private startTyping(): void {
    const element = this.searchBox()?.nativeElement;

    if (!element) {
      return;
    }

    this.typing.set(true);
    this.query.set('');
    this.activeIndex.set(0);
    element.value = '';
    element.removeAttribute('inputmode');
    element.blur();
    element.focus();
  }

  pick(id: number | null): void {
    this.valueChange.emit(id);
    this.open.set(false);
    this.query.set('');
    this.typing.set(false);

    if (matchMedia('(pointer: coarse)').matches) {
      this.searchBox()?.nativeElement.blur();
    }
  }

  close(): void {
    this.open.set(false);
    this.query.set('');
    this.typing.set(false);
    this.searchBox()?.nativeElement.blur();
  }

  onSearch(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
    this.activeIndex.set(0);
    this.open.set(true);
  }

  onKeydown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.step(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.step(-1);
        break;
      case 'Enter': {
        event.preventDefault();

        if (!this.open()) {
          this.openPanel();
          break;
        }

        const option = this.flattened()[this.activeIndex()];

        if (option) {
          this.pick(option.id);
        }
        break;
      }
      case 'Escape':
        event.preventDefault();
        this.close();
        break;
    }
  }

  private step(delta: number): void {
    if (!this.open()) {
      const items = this.allItems();
      const current = items.findIndex((item) => item.id === this.value());
      const next = items[clamp(current + delta, items.length)];

      if (next && next.id !== this.value()) {
        this.valueChange.emit(next.id);
      }

      return;
    }

    this.activeIndex.update((index) =>
      clamp(index + delta, this.flattened().length),
    );
    this.scrollActiveIntoView();
  }

  private groupStart(label: string | null): number {
    let start = 0;

    for (const group of this.filtered()) {
      if (group.label === label) {
        return start;
      }

      start += group.items.length;
    }

    return -1;
  }

  private scrollActiveIntoView(groupToTop = false): void {
    afterNextRender(
      () => {
        const list = this.host.nativeElement.querySelector('.panel-list') as HTMLElement | null;
        const option = list?.querySelector('.option--active') as HTMLElement | null;

        if (!list || !option) {
          return;
        }

        const header = option.closest('li')?.previousElementSibling as HTMLElement | null;

        if (groupToTop && header?.classList.contains('option-group')) {
          list.scrollTop = header.offsetTop - list.offsetTop;

          return;
        }

        const top = option.offsetTop - list.offsetTop;
        const bottom = top + option.offsetHeight;

        if (top < list.scrollTop) {
          list.scrollTop = top;
        } else if (bottom > list.scrollTop + list.clientHeight) {
          list.scrollTop = bottom - list.clientHeight;
        }
      },
      { injector: this.injector },
    );
  }

  isActive(item: SelectItem): boolean {
    return this.flattened()[this.activeIndex()]?.id === item.id;
  }

  @HostListener('document:pointerdown', ['$event'])
  onDocumentPointerDown(event: PointerEvent): void {
    if (
      this.open() &&
      !this.host.nativeElement.contains(event.target as Node)
    ) {
      this.close();
    }
  }
}

function clamp(index: number, length: number): number {
  return Math.min(Math.max(index, 0), Math.max(length - 1, 0));
}

const LIST_GAP = 12;
const PANEL_OFFSET = 4;

const TYPING_MIN_LENGTH = 3;
const TYPING_MAX_RESULTS = 2;

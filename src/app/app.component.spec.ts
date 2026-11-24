import { TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { provideRouter, Router } from '@angular/router';
import { AppComponent } from './app.component';
import { routes } from './app.routes';
import { SpoilerService } from './services/spoiler.service';
import { GrowthDataService } from './services/growth-data.service';
import { of } from 'rxjs';
import { Mount } from './models/growth.models';

@Component({ template: '<p>Page content</p>' })
class NoticeTestPage {}

describe('AppComponent spoiler reminders', () => {
  const preferenceKey = 'fe-forge.spoiler-notice-dismissed';
  let fixture: ReturnType<typeof TestBed.createComponent<AppComponent>>;
  let router: Router;
  let spoilers: SpoilerService;
  let previousPreference: string | null;
  let previousTiers: string | null;

  const navigate = async (url: string) => {
    await router.navigateByUrl(url);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };
  const notice = () => fixture.nativeElement.querySelector('app-spoiler-notice dialog') as HTMLDialogElement | null;
  const dismiss = () => {
    (notice()!.querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();
  };

  beforeEach(async () => {
    previousPreference = localStorage.getItem(preferenceKey);
    previousTiers = localStorage.getItem('fe-forge.hidden-spoiler-tiers');
    localStorage.removeItem(preferenceKey);
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideRouter(routes.map(({ loadComponent, ...route }) =>
        loadComponent ? { ...route, component: NoticeTestPage } : route,
      ))],
    }).compileComponents();
    router = TestBed.inject(Router);
    spoilers = TestBed.inject(SpoilerService);
    spoilers.setAllHidden(true);
    fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    const preferences: [string, string | null][] = [
      [preferenceKey, previousPreference],
      ['fe-forge.hidden-spoiler-tiers', previousTiers],
    ];
    for (const [key, value] of preferences) {
      if (value === null) {
        localStorage.removeItem(key);
      } else {
        localStorage.setItem(key, value);
      }
    }
  });

  for (const url of ['/growth-mapper', '/calculator', '/projected-stats', '/characters',
    '/characters/1', '/classes', '/classes/1', '/mounts', '/seed-mapper']) {
    it(`shows a modal reminder on direct navigation to ${url}`, async () => {
      await navigate(url);
      expect(notice()?.open).toBeTrue();
      expect(notice()?.textContent).toContain('Some data is hidden');
    });
  }

  for (const url of ['/', '/weapons', '/battalions']) {
    it(`never warns on ${url}, including after leaving a filtered page`, async () => {
      await navigate('/growth-mapper');
      await navigate(url);
      expect(notice()).toBeNull();
    });
  }

  it('warns for a single hidden tier, but not when all tiers are shown', async () => {
    spoilers.setAllHidden(false);
    await navigate('/growth-mapper');
    expect(notice()).toBeNull();
    spoilers.setHidden('dlc', true);
    fixture.detectChanges();
    expect(notice()?.open).toBeTrue();
    spoilers.setAllHidden(false);
    fixture.detectChanges();
    expect(notice()).toBeNull();
  });

  for (const tier of ['war', 'dlc'] as const) {
    it(`does not warn on mounts when only ${tier} spoilers are hidden`, async () => {
      spoilers.setAllHidden(false);
      spoilers.setHidden(tier, true);
      await navigate('/mounts');
      expect(notice()).toBeNull();
    });

    it(`only warns on classes for a tier that hides classes (${tier})`, async () => {
      spoilers.setAllHidden(false);
      spoilers.setHidden(tier, true);
      await navigate('/classes');
      expect(!!notice()).toBe(tier === 'dlc');
    });
  }

  it('updates the mounts warning when Salvation Arc actually hides mounts', async () => {
    spoilers.setHidden('salvation', false);
    await navigate('/mounts');
    expect(notice()).toBeNull();
    spoilers.setHidden('salvation', true);
    fixture.detectChanges();
    expect(notice()?.open).toBeTrue();
    spoilers.setHidden('salvation', false);
    fixture.detectChanges();
    expect(notice()).toBeNull();
  });

  it('does not warn for an empty catalog even when all spoiler toggles are on', async () => {
    fixture.destroy();
    spyOn(TestBed.inject(GrowthDataService), 'getMounts').and.returnValue(of([]));
    fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    await navigate('/mounts');
    expect(notice()).toBeNull();
  });

  it('does not warn when none of the available catalog entries is hidden', async () => {
    fixture.destroy();
    const data = TestBed.inject(GrowthDataService);
    let visibleMounts: Mount[] = [];
    data.getMounts().subscribe((mounts) => visibleMounts = spoilers.filter(mounts));
    expect(visibleMounts.length).toBeGreaterThan(0);
    spyOn(data, 'getMounts').and.returnValue(of(visibleMounts));
    fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    await navigate('/mounts');
    expect(notice()).toBeNull();
  });

  it('dismisses for this visit only and warns again when returning', async () => {
    await navigate('/growth-mapper');
    dismiss();
    expect(notice()).toBeNull();
    spoilers.setAllHidden(false);
    fixture.detectChanges();
    spoilers.setAllHidden(true);
    fixture.detectChanges();
    expect(notice()).toBeNull();
    await navigate('/weapons');
    await navigate('/growth-mapper');
    expect(notice()?.open).toBeTrue();
  });

  it('dismisses with Escape without reopening during the same visit', async () => {
    await navigate('/classes');
    notice()!.dispatchEvent(new Event('cancel', { cancelable: true }));
    fixture.detectChanges();
    expect(notice()).toBeNull();
  });

  it('persists the opt-out across navigation and app recreation', async () => {
    await navigate('/growth-mapper');
    const checkbox = notice()!.querySelector('input')!;
    checkbox.click();
    dismiss();
    expect(localStorage.getItem(preferenceKey)).toBe('true');
    await navigate('/classes');
    expect(notice()).toBeNull();
    fixture.destroy();
    fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    expect(notice()).toBeNull();
  });

  it('reports storage failure and lets the user dismiss without saving', async () => {
    await navigate('/growth-mapper');
    spyOn(console, 'warn');
    const save = spyOn(Storage.prototype, 'setItem').and.throwError('Storage unavailable');
    const checkbox = notice()!.querySelector('input')!;
    checkbox.click();
    dismiss();
    expect(notice()?.querySelector('[role=alert]')?.textContent).toContain("Couldn't save");
    expect(console.warn).toHaveBeenCalled();
    checkbox.click();
    dismiss();
    expect(notice()).toBeNull();
    save.and.callThrough();
  });

  it('resets the shared main scroller when changing routes', async () => {
    const scroller = fixture.nativeElement.querySelector('main') as HTMLElement;
    const scroll = spyOn(scroller, 'scrollTo');

    await navigate('/growth-mapper');

    expect(scroll).toHaveBeenCalled();
    expect(scroll.calls.mostRecent().args as unknown as [ScrollToOptions])
      .toEqual([{ top: 0, left: 0, behavior: 'auto' }]);
  });

  it('anchors the navbar and prevents root scrolling', () => {
    const host = fixture.nativeElement as HTMLElement;
    const nav = host.querySelector('.topnav')!;
    expect(getComputedStyle(host).overflow).toBe('clip');
    expect(getComputedStyle(nav).position).toBe('sticky');
    expect(getComputedStyle(nav).top).toBe('0px');
    host.scrollTop = 100;
    expect(host.scrollTop).toBe(0);
    expect(host.querySelector('.topnav')).toBeTruthy();
  });
});

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it(`should have the 'fe-forge-frontend' title`, () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app.title).toEqual('fe-forge-frontend');
  });

  it('should render the router outlet', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('router-outlet')).toBeTruthy();
  });

  it('selects number input values after focus for easy replacement', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const input = document.createElement('input');
    input.type = 'number';
    input.value = '42';
    fixture.nativeElement.append(input);
    const select = spyOn(input, 'select');

    input.focus();
    await new Promise<void>((resolve) => setTimeout(resolve, 30));
    expect(select).toHaveBeenCalledTimes(1);

    input.click();
    await new Promise<void>((resolve) => setTimeout(resolve, 30));
    expect(select).toHaveBeenCalledTimes(2);
  });

  it('closes the open menu when the area below it is tapped', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const compiled = fixture.nativeElement as HTMLElement;
    fixture.componentInstance.toggleMenu();
    fixture.detectChanges();

    (compiled.querySelector('.topnav-backdrop') as HTMLElement).click();
    fixture.detectChanges();

    expect(fixture.componentInstance.menuOpen()).toBeFalse();
    expect(compiled.querySelector('.topnav-backdrop')).toBeNull();
  });
});

describe('AppComponent mobile field visibility', () => {
  const viewport = Object.assign(new EventTarget(), {
    height: 844, width: 390, offsetTop: 0, offsetLeft: 0,
    pageTop: 0, pageLeft: 0, scale: 1, onresize: null, onscroll: null,
  });
  const content = 3000;
  let fixture: ReturnType<typeof TestBed.createComponent<AppComponent>>;
  let host: HTMLElement;
  let scroller: HTMLElement;
  let select: HTMLElement;
  let field: HTMLInputElement;
  let panel: HTMLElement;
  let fieldPos: number;
  let panelHeight: number;
  let scrollTop: number;
  let innerHeight: number;
  let coarse: boolean;
  let scroll: jasmine.Spy;

  const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
  const px = (name: string) => parseFloat(host.style.getPropertyValue(name)) || 0;
  const maxScroll = () => content + px('--keyboard-inset') + px('--scroll-extra') - 788;
  const fieldTop = () => fieldPos - scrollTop;
  const panelBottom = () => panel.getBoundingClientRect().bottom;
  const openKeyboard = async (height = 400) => {
    viewport.height = height;
    viewport.dispatchEvent(new Event('resize'));
    await wait(300);
  };
  const closeKeyboard = async () => {
    viewport.height = 844;
    viewport.dispatchEvent(new Event('resize'));
    await wait(300);
  };
  const tap = async () => {
    field.focus();
    await wait(0);
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideRouter([])],
    }).compileComponents();
    localStorage.setItem('fe-forge:keyboard-inset', '444');
    spyOnProperty(window, 'visualViewport', 'get').and.returnValue(viewport);
    innerHeight = 844;
    spyOnProperty(window, 'innerHeight', 'get').and.callFake(() => innerHeight);
    coarse = true;
    const media = window.matchMedia('(pointer: coarse)');
    spyOnProperty(media, 'matches', 'get').and.callFake(() => coarse);
    spyOn(window, 'matchMedia').and.returnValue(media);
    viewport.height = 844;
    viewport.offsetTop = 0;
    fieldPos = 700;
    panelHeight = 208;
    scrollTop = 0;
    fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    host = fixture.nativeElement;
    scroller = host.querySelector('main')!;
    spyOn(scroller, 'getBoundingClientRect').and.returnValue(new DOMRect(0, 56, 390, 788));
    spyOnProperty(scroller, 'scrollHeight', 'get').and.callFake(() => maxScroll() + 788);
    spyOnProperty(scroller, 'clientHeight', 'get').and.returnValue(788);
    spyOnProperty(scroller, 'scrollTop', 'get').and.callFake(() => (scrollTop = Math.min(scrollTop, maxScroll())));
    scroll = spyOn(scroller, 'scrollTo').and.callFake(((options: ScrollToOptions) => {
      scrollTop = Math.min(options.top ?? 0, maxScroll());
    }) as unknown as typeof scroller.scrollTo);
    select = document.createElement('app-searchable-select');
    field = document.createElement('input');
    panel = document.createElement('div');
    panel.className = 'panel';
    select.append(field, panel);
    scroller.append(select);
    spyOn(field, 'getBoundingClientRect').and.callFake(() => new DOMRect(0, fieldTop(), 300, 30));
    spyOn(panel, 'getBoundingClientRect').and.callFake(() => {
      const cap = parseFloat(select.style.getPropertyValue('--dropdown-max-height'));
      return new DOMRect(0, fieldTop() + 34, 300, Math.min(panelHeight, Number.isNaN(cap) ? panelHeight : cap));
    });
  });

  afterEach(() => {
    fixture.destroy();
    localStorage.removeItem('fe-forge:keyboard-inset');
  });

  it('moves the dropdown just above the keyboard right after the tap, before the keyboard opens', async () => {
    await tap();

    expect(scroll).toHaveBeenCalledOnceWith({ top: 550, behavior: 'auto' });
    expect(panelBottom()).toBe(392);
    expect(fieldTop()).toBeGreaterThanOrEqual(64);
  });

  it('measures keyboard inset from the baseline when standalone Safari resizes innerHeight', async () => {
    await tap();
    innerHeight = 400;
    viewport.height = 400;
    viewport.dispatchEvent(new Event('resize'));
    await wait(300);

    expect(host.style.getPropertyValue('--keyboard-inset')).toBe('444px');
  });

  it('does not move again once the keyboard opens where it was expected', async () => {
    await tap();
    await openKeyboard();

    expect(scroll).toHaveBeenCalledTimes(1);
    expect(panelBottom()).toBe(392);
    expect(panel.getBoundingClientRect().height).toBe(208);
  });

  it('makes one small correction for a keyboard of a new height, and remembers it', async () => {
    localStorage.removeItem('fe-forge:keyboard-inset');
    fixture.componentInstance['keyboardInset'] = 422;

    await tap();
    expect(scroll).toHaveBeenCalledOnceWith({ top: 528, behavior: 'auto' });

    await openKeyboard();
    expect(scroll).toHaveBeenCalledTimes(2);
    expect(scroll.calls.mostRecent().args[0]).toEqual({ top: 550, behavior: 'smooth' });
    expect(panelBottom()).toBe(392);
    expect(localStorage.getItem('fe-forge:keyboard-inset')).toBe('444');
  });

  it('does not move the page while the search filters the list', async () => {
    await tap();
    await openKeyboard();
    panelHeight = 47;
    panel.append(document.createElement('span'));
    await wait(300);
    panelHeight = 208;
    panel.append(document.createElement('span'));
    await wait(300);

    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scrollTop).toBe(550);
  });

  it('sizes a list that cannot fit above the keyboard once, at the tap, and keeps that size', async () => {
    fixture.componentInstance['keyboardInset'] = 594;
    await tap();

    expect(panel.getBoundingClientRect().height).toBe(144);
    expect(scroll).toHaveBeenCalledOnceWith({ top: 636, behavior: 'auto' });

    await openKeyboard(250);

    expect(scroll).toHaveBeenCalledTimes(1);
    expect(panel.getBoundingClientRect().height).toBe(144);
    expect(fieldTop()).toBe(64);
    expect(panelBottom()).toBe(242);
  });

  it('never shrinks the list after the keyboard opens, even when the keyboard is taller than expected', async () => {
    await tap();
    await openKeyboard(344);

    expect(panel.getBoundingClientRect().height).toBe(208);
    expect(scroll).toHaveBeenCalledTimes(2);
    expect(scroll.calls.mostRecent().args[0]).toEqual({ top: 606, behavior: 'smooth' });
    expect(panelBottom()).toBe(336);
  });

  it('adds room below the last calculator so its dropdown can reach the keyboard too', async () => {
    scrollTop = 2212;
    fieldPos = 2212 + 600;
    await tap();

    expect(host.style.getPropertyValue('--scroll-extra')).toBe('450px');
    expect(scroll).toHaveBeenCalledOnceWith({ top: 2662, behavior: 'auto' });
    expect(panelBottom()).toBe(392);
  });

  it('keeps the page still when the keyboard closes, releasing the spare room as you scroll up', async () => {
    scrollTop = 2212;
    fieldPos = 2212 + 600;
    await tap();
    await openKeyboard();
    field.blur();
    await closeKeyboard();

    expect(scroller.scrollTop).toBe(2662);
    expect(host.style.getPropertyValue('--keyboard-inset')).toBe('');

    scrollTop = 2400;
    scroller.dispatchEvent(new Event('scroll'));
    expect(host.style.getPropertyValue('--scroll-extra')).toBe('188px');
    expect(scroller.scrollTop).toBe(2400);

    scrollTop = 1000;
    scroller.dispatchEvent(new Event('scroll'));
    expect(host.style.getPropertyValue('--scroll-extra')).toBe('');
  });

  it('does not pull the page back down when iOS pans the screen while the keyboard is open', async () => {
    await tap();
    await openKeyboard();
    viewport.offsetTop = 200;
    viewport.dispatchEvent(new Event('scroll'));
    await wait(300);

    expect(scroll).toHaveBeenCalledTimes(1);
    expect(panel.getBoundingClientRect().height).toBe(208);
  });

  it('keeps the option list stationary while focus moves to an option for selection', async () => {
    const option = document.createElement('button');
    panel.append(option);
    await tap();
    await openKeyboard();
    host.style.setProperty('--scroll-extra', '100px');
    option.focus();

    expect(select.style.getPropertyValue('--dropdown-max-height')).not.toBe('');
    expect(host.style.getPropertyValue('--scroll-extra')).toBe('100px');
  });

  describe('tapping a dropdown', () => {
    let dropdown: HTMLElement;
    let input: HTMLInputElement;

    const touch = (type: string, target: Element, y: number) => {
      const point = new Touch({ identifier: 1, target, clientX: 10, clientY: y });
      const event = new TouchEvent(type, {
        touches: type === 'touchend' ? [] : [point],
        changedTouches: [point],
        bubbles: true,
        cancelable: true,
      });
      target.dispatchEvent(event);
      return event;
    };
    const tapOn = (target: Element, from = 300, to = from) => {
      touch('touchstart', target, from);
      return touch('touchend', target, to);
    };

    beforeEach(() => {
      dropdown = document.createElement('app-searchable-select');
      dropdown.style.setProperty('--dropdown-height', '13rem');
      const box = document.createElement('div');
      box.className = 'field';
      input = document.createElement('input');
      box.append(input);
      dropdown.append(box);
      scroller.append(dropdown);
      spyOn(dropdown, 'getBoundingClientRect').and.callFake(() => new DOMRect(0, fieldTop() - 6, 300, 30));
      spyOn(input, 'getBoundingClientRect').and.callFake(() => new DOMRect(0, fieldTop(), 300, 18));
    });

    it('moves the page so the list will rest above the keyboard before the field gets focus', async () => {
      const focusedWhenMoved: (Element | null)[] = [];
      scroll.and.callFake(((options: ScrollToOptions) => {
        focusedWhenMoved.push(document.activeElement);
        scrollTop = Math.min(options.top ?? 0, maxScroll());
      }) as unknown as typeof scroller.scrollTo);

      const event = tapOn(input);

      expect(event.defaultPrevented).toBeTrue();
      expect(scroll).toHaveBeenCalledOnceWith({ top: 544, behavior: 'auto' });
      expect(focusedWhenMoved).toEqual([document.body]);
      expect(document.activeElement).toBe(input);
      expect(dropdown.style.getPropertyValue('--dropdown-max-height')).toBe('300px');
      expect(fieldTop() + 28 + 208).toBe(392);

      await wait(0);
      await openKeyboard();
      expect(scroll).toHaveBeenCalledTimes(1);
    });

    it('works the same from the arrow part of the field', () => {
      const event = tapOn(dropdown.querySelector('.field')!);

      expect(event.defaultPrevented).toBeTrue();
      expect(document.activeElement).toBe(input);
    });

    it('scrolls the dialog, not the page behind it, for a dropdown inside a dialog', () => {
      const modal = document.createElement('div');
      modal.setAttribute('aria-modal', 'true');
      scroller.append(modal);
      modal.append(dropdown);
      spyOn(modal, 'getBoundingClientRect').and.returnValue(new DOMRect(0, 12, 390, 640));
      spyOnProperty(modal, 'scrollHeight', 'get').and.returnValue(2000);
      spyOnProperty(modal, 'clientHeight', 'get').and.returnValue(640);
      const modalScroll: jasmine.Spy = spyOn(modal, 'scrollTo');

      const event = tapOn(input);

      expect(event.defaultPrevented).toBeTrue();
      expect(modalScroll).toHaveBeenCalledOnceWith({ top: 544, behavior: 'auto' });
      expect(scroll).not.toHaveBeenCalled();
      expect(host.style.getPropertyValue('--scroll-extra')).toBe('');
      expect(document.activeElement).toBe(input);
    });

    it('creates enough modal scroll room for a keyboard-predicted shift', () => {
      const modal = document.createElement('div');
      modal.setAttribute('aria-modal', 'true');
      scroller.append(modal);
      modal.append(dropdown);
      spyOn(modal, 'getBoundingClientRect').and.returnValue(new DOMRect(0, 12, 390, 640));
      spyOnProperty(modal, 'scrollHeight', 'get').and.returnValue(640);
      spyOnProperty(modal, 'clientHeight', 'get').and.returnValue(640);
      const modalScroll: jasmine.Spy = spyOn(modal, 'scrollTo');

      tapOn(input);

      expect(modal.style.getPropertyValue('--keyboard-dialog-extra')).toBe('544px');
      expect(modalScroll).toHaveBeenCalledOnceWith({ top: 544, behavior: 'auto' });

      fixture.componentInstance['scrollBy'](modal, 100, 'smooth');
      expect(modal.style.getPropertyValue('--keyboard-dialog-extra')).toBe('644px');

      input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
      expect(modal.style.getPropertyValue('--keyboard-dialog-extra')).toBe('');
    });

    it('leaves a scrolling drag alone', () => {
      const event = tapOn(input, 300, 360);

      expect(event.defaultPrevented).toBeFalse();
      expect(scroll).not.toHaveBeenCalled();
      expect(document.activeElement).not.toBe(input);
    });

    it('leaves a tap on the already open dropdown alone, so it can close as usual', async () => {
      input.focus();
      await wait(0);
      scroll.calls.reset();

      const event = tapOn(input);

      expect(event.defaultPrevented).toBeFalse();
      expect(scroll).not.toHaveBeenCalled();
    });
  });
  it('leaves the page alone with a mouse', async () => {
    coarse = false;
    await tap();
    await openKeyboard();

    expect(scroll).not.toHaveBeenCalled();
  });
});

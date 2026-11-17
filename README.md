# FE Forge

Fire Emblem Forge: character building tools for Fire Emblem Fortune's Weave unit planning.
Everything runs in the browser; there is no backend and no network access at runtime.

Live at [feforge.app](https://feforge.app).

## Pages

The home page introduces each tool, has an About the Developer section, and opens the
donation dialog. The nav bar shows the three tools first, then a **Resources** dropdown
with the reference pages.

### Tools

| Page | What it does |
| --- | --- |
| Growth Mapper | Mark which stats rose on each level up to map a save's fixed growth rolls, then explore exam and reclass branches. Uses the Timeline view exclusively, with Seed RNG roll ranges and saves |
| Calculator | Stacks unit + class + mount growths; compare any two calculators side by side, using **Change** in the comparison to switch either build's unit, class (and its level), mount or bond level |
| Projected Stats | Projects a unit's stats to any level across a planned class path, with each stat's average, spread and histogram; compare two builds side by side |

### Resources

| Page | What it does |
| --- | --- |
| Characters | Every unit's personal growths with a quality heatmap, plus recruitment details |
| Classes | Class growth modifiers and abilities, grouped by rank |
| Mounts | Mount growth bonuses, grouped by mount type |
| Battalions | Each battalion's rank, flat stat bonuses and skill, grouped by battalion type |

The nav bar also has **Suggestions** (send feedback) and **Spoilers** (hide War Arc,
Salvation Arc and DLC units, classes and mounts).

### Equipment

Projected Stats (in-game view and in-game stat entry) and each Growth Mapper
section have an **Equipment** modal. Weapons are separated into Sword, Spear,
Axe, Bow and Gauntlets tabs; Shield, Mask, Staff and Accessory share the Equipment
tab. Other weapon types in the catalog get their own tabs. Equip one weapon, plus one each of Shield,
Mask, Staff, and Accessory. Selecting another item in the same slot replaces it;
untick an item to remove it. Changes apply only on Confirm.
Item details are collapsed initially. Click or tap an item's name or disclosure
arrow to show or hide its details; use its checkbox to equip or unequip it.
Only one item's details can be open at a time.
Weapon names show their skill icon. Expanded details show the description,
then two columns: Mt/Hit/Crit/Curse and Wt/Avo/Rng/Skill, with skill icons beside
the required ranks. Durability stays visible beside the dropdown arrow on the
item's top row; effectiveness and bonus stats appear inside the details.

The standalone `ItemCardComponent` (`app-item-card`) renders this item display
without a modal. Pass `[item]` to show a read-only card. For equip selection,
set `[selectable]="true"`, bind `[selected]` and `[disabled]`, and handle
`(selectionChange)`. Cards with the same `[disclosureGroup]` allow only one
description open at a time; use a different group for each independent list.
Character Details converts each recruitment chapter's weapons, tomes and items
into read-only item cards using the recruitment document's values. Weapon type
comes from `WeaponType` or the item's `Skills`/legacy `Skill` requirement; magic
groups supply Black/White Magic. The item catalog can fill missing fields, but
items such as Cai's Wooden Spear do not need a catalog entry. Combat arts keep
their own display. Missing/non-applicable combat stats remain `--`, and white
magic retains its Pwr value.

Item cards display effectiveness as colored boxes containing only the target type
(for example, `Cavalry`): orange for Effective and red for Effective+. They are centered
between the item name and durability and visible while details are collapsed.
Hover text and accessible labels show the full `Effective <type>` or `Effective+ <type>`
label plus `2x weapon Might` or `3x weapon Might`, respectively. Legacy `Extra`
prefixes map to `Effective+` without changing saved or source data.
These are text badges, not verified game icon assets.

Stat values with a positive non-class modifier are gold with a
small up arrow in Growth Mapper, projection results, and Character/Class details.
Class-only bonuses, unmodified values and penalties alone use the base text color. Hover breakdowns
separate `Base Value`, `Class`, and `Modifier`; modifiers include the applied
(capped) equipment, mount, ability and other non-class bonuses. Base projection
views exclude these bonuses. Class floor increases remain part of the base value.
Character recruitment stats also include passive Blaze modifiers (for example,
Cai's Mag+3) in the value and Modifier tooltip. Structured Blaze source bonuses
take precedence over legacy fallback values and are applied once, not stacked.
The Blaze tab retains the source description without a duplicate stat bonus row.
Bonus arrows sit outside the value's layout box so stat alignment is unchanged.
Character recruitment growth rates also use the gold indicator for personal
growth bonuses, such as Mu's +20%, retaining their base/bonus hover breakdown.
Growth Mapper growth rows likewise highlight positive mount and personal growth
modifiers, with Base Value / Class / Modifier percentage tooltips for each row's
current class and mount. Class growth alone does not trigger a gold indicator.
Class growth gates apply after gaining stats at Lv 35/45 for Charioteer and
Lv 45 for Elephant Rider: the new growth starts at Lv 36/46 and Lv 46, respectively.
Charioteer doubles its selected mount's growth bonuses.
A Riding-icon button beside each mounted timeline level opens Mount and Bond Level
controls, including on exam/reclass branches. Changes apply to that level's growth
and all subsequent levels until changed again, without altering earlier levels.
Use **Use previous mount** to remove a level's override. Mount changes persist with
the map and are included in projected history; Seed setup retains its starting-mount
controls. Shared ancestor levels must be edited on their own timeline.
The header's **Exam / Reclass** action adds a level to the selected timeline;
**Current** follows the latest branch.
Riding icons are silver without mount bonuses, gold with mount bonuses, and black
with a gold outline while that level's picker is open.
Usable skills use a gold border, retaining the normal green panel background and
the boon/bane icon colors.

Selectable equipment cards group catalog entries such as `Wooden Sword` and
`Wooden Sword+1` into one card with an upgrade dropdown. Blank selects the base
item; only existing single-digit upgrades (0-9) are offered. Each upgrade uses its
own catalog stats and name, including in saves. Changing a dropdown does not equip
an unchecked item; equipped items switch variants in the dialog draft until confirmed.
Read-only cards have no upgrade controls.
The upgrade control sits directly after the base name: a down arrow for the base
item, or a subtly outlined `+X` suffix with a highlighted border on focus.

Items with no combat values or skill requirements (such as Vulnerary) show only
their description when expanded, instead of an all-placeholder combat table.

Item stat bonuses share the existing +10 per-stat non-class bonus limit with
abilities, mounts and other bonuses. They do not change level-up growth or class
floors. An equipped weapon also supplies the type for weapon-dependent abilities.
Growth Mapper saves and new exam/reclass sections retain equipment by item name.

## Running it

```bash
npm install
npm start          # http://localhost:4200
npm test           # unit tests
npm run build      # production build, then deploy to GitHub Pages
```

`npm run build` builds into `dist/fe-forge/browser` with a base href of `/`, then
publishes that folder to the `gh-pages` branch with the `feforge.app` custom domain
(`angular-cli-ghpages` also copies `index.html` to `404.html`, so deep links work).
To build without deploying, run `npx ng build --configuration production`.

The build output is a plain static site; any host works as long as unknown paths
fall back to `index.html`.

## Mobile behaviour

On touch devices, tapping a dropdown moves the page once, before the field takes
focus, so its list rests just above where the on-screen keyboard will open. It
uses the keyboard height measured last time (remembered in the browser), so the
field is already clear of the keyboard when it opens and iOS has no reason to
scroll the page itself. Other fields are moved right after they take focus. After
that the page only moves if the dropdown is actually covered: typing, picking an
option and closing the keyboard leave it where it is. Room under the page lets the
last calculator move up too; it is released as you scroll back up. A dropdown's
size is set once when it opens and never changes while open; it is only shorter
than normal on screens too small to fit it above the keyboard.

On phones, each calculator's pickers always take two rows, so a calculator keeps
the same height whatever is picked: Unit above Class for unmounted classes, and
Unit | Class above Mount | Bond Level once the class has a mount (a class Level
shares the right half of the second row). The Mount Growth rows are always shown.
The calculator page also leaves one calculator's worth of space below the last
calculator, so it can be scrolled up like the others.

## Where the data comes from

The data lives in [`src/app/data`](src/app/data) and is compiled into the bundle,
so the app works with no server and no fetches:

| File | Contents |
| --- | --- |
| `units.json` | Personal growth rates per unit |
| `unit-classes.json` | Class growth modifiers and rank |
| `mounts.json` | Mount growth bonuses and type |
| `class-mount-types.json` | Class name → mount type, the port of `ClassMountLookup` |
| `mount-bond-levels.json` | Special mounts' stat and growth bonuses per bond level |
| `base-stats.json` | Each unit's Lv 1 base stats |
| `class-abilities.json` | Class abilities and combat arts, with descriptions |
| `stat-boost-abilities.json` | Abilities that raise the unit's own stats while equipped |
| `item.json` | Weapons and equipment, including descriptions, requirements and optional flat stat bonuses |
| `unit-skill-preferences.json` | Each unit's good/neutral/bad skill (weapon, magic, movement) preferences |
| `battalions.json` | Battalion stat bonuses, type, rank and skill (maintained by hand) |

`class-mount-types.json` is keyed by **class name**, not id, so reordering or
renumbering the source data does not silently remap mounts.

### Refreshing it

`units.json`, `unit-classes.json`, `mounts.json` and `class-mount-types.json` are
exported from the `FE.Growth.API` project. To pull newer values, start that API
and run:

```bash
node tools/refresh-data.js                        # http profile, port 5081
node tools/refresh-data.js https://localhost:7252 # https profile
```

The other files don't come from the API, so the refresh leaves them alone; edit
them directly.

`GrowthDataService` reads the main growth data. It exposes the
same observable-returning methods the HTTP service used, so nothing else in the
app knows the difference. The shared equipment model reads `item.json` directly.
This catalog is a JSON array with unique `Name` values. `WeaponType` values
`Shield`, `Mask`, `Staff`, and `Accessory` use their own slots; other types share
the single weapon slot. `BonusStats` is null, omitted, or an array such as
`[{"Spd": 2, "Str": 1}]`; only HP, Str, Mag, Spd, Dex, Def, Res, Lck and Cha
(case-insensitive) contribute stat bonuses. The singular `BonusStat` is also
accepted. Combat values such as Mt, Hit and Wt are displayed but not added to
these stats.

### Recruitment

Each unit's recruitment details live in their own file in
[`src/app/data/recruitment`](src/app/data/recruitment), named after the unit
(`UnitId` must match the unit's name in `units.json`). They fill in the
character page: the personal ability, level-up personal abilities and bloodmark
sit under the name, and the Recruitment tab has a tab per route and a chapter
picker. A route only shows once it has at least one chapter. Projected Stats
also uses them as recruitment starting points.

Just drop a new file in the folder: `npm start`, `build`, `test` and `watch` run
`tools/build-recruitment-index.js` first, which regenerates
`src/app/data/recruitment.ts` to import every file. `RecruitmentDataService`
reads them, separately from `GrowthDataService`.

Some numbers are worked out rather than taken from the files:

- **Growth rates** are the unit's growths plus the chapter class's (at its
  default class level). Alexandra and Io also get Bucephalus and Rocinan at
  Bond Lv 3 when the class has that mount type.
- **Mov** is 4 plus the class's Mov bonus.
- **Bld** is Str / 5, rounded up (Str 1-5 is 1, 6-10 is 2, and so on).

## Saves

Growth Mapper state can be kept in three ways, all from the **Saves** section:

- **Save to browser**: named entries in `localStorage`, loadable, renameable,
  overwritable and deletable
- **Download JSON**: a portable save file
- **Upload JSON**: restore from a file

Save files reference units, classes and mounts **by name** rather than by id,
so they survive edits to the underlying data. Each save carries a GUID, so a
downloaded file re-uploads onto the same entry rather than duplicating it.

An unsaved-changes counter in the header tracks edits since the last save or
load, and confirms before anything would discard them.

Browser storage uses `fe-forge.*` keys. Saves and spoiler settings stored under
the old `fe-growth.*` keys are carried over automatically on first load.

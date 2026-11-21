# Angular 19 prerendering readiness audit

Date: 2026-11-21. Scope: code inspection, not a verified build.

## Findings

- `package.json` uses Angular 19 and `angular-cli-ghpages`. The build script runs `ng build --configuration production && npx angular-cli-ghpages --dir=dist/fe-forge/browser --cname=feforge.app`. Do not invoke `npm run build` for a local prerender test: it also publishes.
- `angular.json` uses the application builder and copies `public/**` into the output. There is no SSR/prerender configuration in the inspected file.
- `src/app/app.routes.ts` has nine static primary routes plus the homepage and two dynamic routes, `characters/:id` and `classes/:id`; `seed-mapper` redirects to `growth-mapper`. Verify the route inventory against the current file before implementing.
- `src/app/services/growth-data.service.ts` imports units and classes from bundled JSON. Valid IDs can be derived from those datasets at build time. Angular server route definitions will need `getPrerenderParams` for the parameterized routes, or these routes must initially be client-rendered.
- `src/app/services/spoiler.service.ts` reads `localStorage` during signal initialization and writes in an effect. Reads are try/catch guarded, but the service's initial state defaults to hidden spoilers without storage. Prerendering must use a deterministic default and avoid persisting preferences server-side; review hydration differences.
- `src/app/app.component.ts` uses browser globals including `document`, `window`, `localStorage`, and viewport APIs. Some use is within `afterNextRender`, which is browser-only; review remaining uses and helpers (including `readKeyboardInset` and `readSpoilerNoticePreference`) for server safety.
- `src/app/character-page/character-page.component.ts` resolves the ID from `ActivatedRoute.paramMap`, and reads bundled data. Verify async rendering and complete HTML output for every dynamic route.

## Implemented in this branch

- Added a descriptive document title, search description, and Open Graph/Twitter metadata to the base HTML. This is a safe, non-prerendering first step.
- Deliberately did not add a global canonical URL: it would incorrectly identify all Angular routes as the homepage.

## Before enabling prerendering

1. Inventory all browser global access across components/services, including constructors, property initializers, computed values and templates.
2. Guard unsafe browser-only operations with `isPlatformBrowser` or move them to `afterNextRender`. Preserve spoiler preferences after hydration.
3. Add Angular 19-compatible `@angular/ssr` with matching versions; configure static output and route-specific server rendering.
4. Derive all valid character/class route IDs from the bundled data, excluding invalid IDs and redirects.
5. Run `npx ng build --configuration production` (not `npm run build`) in CI/test environment. Check generated HTML for content, title, and navigation, and check browser hydration for errors.
6. Verify GitHub Pages deep-link behavior, trailing slash URLs, 404 fallback, and deployment artifact layout.
7. Add sitemap URLs only after confirming the routes are accessible and canonical; submit to Search Console.

## Validation status

No dependency installation, Angular build, SSR execution, hydration test, or GitHub Pages deployment was performed in this audit. Do not merge an SSR configuration without those checks.

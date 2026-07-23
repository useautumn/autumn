# design-sync notes — @autumn/ui

Repo-specific gotchas for future syncs. Read this before re-running.

## Build / environment

- **Sandbox**: `bun install`, `bunx`, and `package-capture.mjs` (playwright) all fail with
  `PermissionDenied` / tempdir errors under the default sandbox. Run them with the sandbox
  disabled. `npm i` in `.ds-sync/` fails on `~/.npm` ownership — use `bun install` instead.
- **Playwright**: repo pins `playwright-core@^1.58` (server only), but the converter needs a
  matching browser. `bun add playwright` in `.ds-sync/` + `npx playwright install chromium`
  landed 1.61.1 / chromium-1228 in `~/Library/Caches/ms-playwright` (macOS path, not `~/.cache`).
- **CSS is Tailwind v4 and must be compiled before the converter runs** — `cfg.cssEntry`
  points at `.ds-compiled/styles.css` (gitignored), produced by `cfg.buildCmd`:
  `bunx @tailwindcss/cli -i packages/ui/src/styles/index.css -o packages/ui/.ds-compiled/styles.css`
  Re-run it whenever component classes change, or new utilities won't exist in the bundle.
- `--entry packages/ui/src/index.ts` is required: the package ships source, not a `dist/`.

## Forks (see cfg.libOverrides)

- **`dts.mjs`** — `@autumn/ui` re-exports its whole API through the `@autumn/ui/*` tsconfig
  path alias. The bundled `projectFor` hardcodes compilerOptions and ignores `cfg.tsconfig`,
  so only 7 of ~214 exports resolved and the build fell through to `[ZERO_MATCH]`
  (tokens-only). The fork reads the nearest tsconfig's `baseUrl`/`paths` into the ts-morph
  project. Without it component discovery returns **zero**.
- **`source-kit.mjs`** — statically imports `./dts.mjs`, bypassing `loadLib`, so it would keep
  loading the *bundled* dts even with the fork present. Repointed at the override; its other
  siblings point at `../../.ds-sync/lib/`.
- On a fresh clone: `ln -sfn ../.ds-sync/node_modules .design-sync/node_modules` (gitignored,
  needed so the forks can resolve `ts-morph`).

## Grouping

Component group comes from the source dir, but the converter's `GENERIC_DIR` skip-list
contains `ui`, so all 144 `components/ui/*` components collapsed into `general`. Fixed with
`cfg.docsMap` pointing every component at a category stub in
`packages/ui/.design-sync/groups/{ui,general}.md`. **The docsMap is generated, not hand-kept** —
if components are added/removed, regenerate it from the source dirs rather than hand-editing.

## The two `Table`s (important)

`components/ui/table.tsx` exports a primitive `Table`; `components/table/index.tsx` exports a
compound `Table` namespace object (the TanStack data-table system). Both would land on
`window.AutumnUI.Table` and the main package's binding wins, silently shadowing the data-table
system. Rather than rename product source, a shim at
`packages/ui/.design-sync/ds-table-entry.tsx` re-exports the namespace as **`DataTable`** and
is wired via `cfg.extraEntries`. Notes:
- The shim must import `@autumn/ui/components/table/index` — the bare directory path fails
  (`esbuild: Cannot read file ...: is a directory`).
- `DataTable` has no preview card: `exportedNames` only reads the main entry, so `extraEntries`
  exports are importable but never get cards. Documented in conventions.md instead.

## Icons

`@phosphor-icons/react` is in `cfg.extraEntries` — without it, every preview importing an icon
silently drops to a floor card. It fires a benign `[EXPORT_COLLISION]` on `Calendar`, `Command`,
`Table`, `Tabs` (the DS components correctly win those names; only `*Icon`-suffixed names are
used in previews). Cost: bundle grows 2.5MB → 9.4MB. If that becomes a problem, the documented
fix is `cfg.storyImports.bundle: ["@phosphor-icons/react"]`.

## Authoring previews for this DS

- **`package-capture.mjs` always fails in-sandbox** (Chromium can't reach the macOS bootstrap
  server: `bootstrap_check_in ... Permission denied (1100)`). Run capture with the sandbox
  disabled. `preview-rebuild.mjs` is fine sandboxed.
- **Controlled components render dead cells without a `useState` wrapper**: `SearchableSelect`
  (`value`/`onValueChange`), `TagInput` (`value: string[]`/`onChange`). Preview exports are real
  components, so hooks are fine.
- `SearchableSelect`'s trigger ships no padding/height — needs `triggerClassName="p-2 h-input"`.
- `FieldLabel`'s `tooltip` prop is silently ignored unless `description` is also passed
  (early return on `!description`), and needs `TooltipProvider`.
- **Hover/focus-only variants can't be shown in a still frame.** `Input variant="destructive"`
  is identical to default at rest — `input-destructive-base` only sets `border-color` under
  `&:hover` / `&:focus`. `Textarea` and `TagInput` carry `aria-invalid:border-destructive`
  (paints at rest) but `Input`'s cva does not, so `aria-invalid` is not a workaround for it.
  Pair such cells with a visible `text-destructive` message so the intent reads statically.
  (This is a real product asymmetry, not a sync artifact — worth a look independently.)

## Overlays: why five components are `cardMode: "single"`

`Dialog`, `Popover`, `Tooltip`, `HoverCard`, `DropdownMenu` have `cfg.overrides` forcing
single-card mode. They open fine — the problem is that each story in a grid card mounts its
own `position: fixed` popup/backdrop at the SAME viewport coords, so stories 2..N end up
buried under the next story's `fixed inset-0` backdrop (the Dialog sheet shows the backdrop
stepping dark → near-white). This is the documented `[GRID_OVERFLOW]` fixed/portal case.

Two theories were tested and **disproved** — don't retry them:
1. *Entry animation* — `open` → `defaultOpen` (base-ui skips the mount transition) produced
   pixel-identical output.
2. *Portal-to-body* — `Select` portals to body and renders fine; it anchors to its trigger.

The differentiator is whether stories can occupy the same viewport rect. `Sheet` survives
because it portals to `[data-main-content]` (per-cell); `Command` renders inline; `Select`
anchors to its trigger.

## base-ui API notes (this DS is base-ui, NOT radix)

- Triggers use `render={<Button />}`, not radix's `asChild` (an `asChild` shim exists, but
  `render` is the native path).
- `Accordion` maps `type="multiple"` → base-ui `multiple`; `defaultValue` is an **array**
  (`defaultValue={["credits"]}`), unlike radix's string.
- `Select` needs `SelectValue` inside `SelectTrigger` or the trigger renders bare.
- `Sheet` accepts `portalContainer`, defaulting to `[data-main-content] ?? document.body`.
- `Tooltip` wraps itself in `TooltipProvider` internally; an outer provider is harmless.
- `Command` is cmdk, not base-ui. `CommandDialog` wraps Dialog (inherits the collision
  problem) — bare `Command` renders inline and previews better.
- `modal={false}` on Dialog/Popover/DropdownMenu/Select avoids scroll-lock and
  `aria-hidden`-ing sibling stories.

## Component API gotchas found while authoring (read the source, don't pattern-match)

- **`Progress` is a false compound** — it renders `ProgressTrack`/`ProgressIndicator` itself
  after `children`. Pass only `ProgressLabel`/`ProgressValue`, or you get a duplicate bar.
- `ToolbarButton` takes no children (hardcoded glyph).
- `InfoTooltip`'s children are the tooltip **content**, not the trigger.
- `IconBadge` / `IconButton` `cloneElement` their icons and override any `size` prop.
- `StackBadge`'s `asset` prop needs network — use `icon` for previews.
- **Capture arg surface**: `package-capture.mjs` is at `.ds-sync/` (not `lib/`) and accepts
  only `--out` and `--components`; `--config`/`--node-modules` are warned and ignored.
- **Popup entry animations capture mid-flight** — a forced-open `<Tooltip open>` screenshots
  with `fade-in-0 zoom-in-95` half-settled, leaving a ghost. The capture harness navigates at
  `networkidle` with no animation settle and no `reducedMotion: 'reduce'`. Affects any preview
  depending on an open popup's entry animation; `cardMode: "single"` sidesteps it for the five
  overlay components above.

## `[RENDER] root empty` on authored components is a FALSE POSITIVE (important)

`package-validate.mjs` navigates with `waitUntil: 'networkidle'` and then immediately
`page.evaluate`s `roots[0].innerHTML` — but the emitted cards mount with React 19's
`ReactDOM.createRoot().render()`, which commits **asynchronously**. At `networkidle` the roots
are genuinely empty; ~300ms later everything is mounted. Measured directly:

```
t+0ms   roots=3 innerHTML lens=[0,0,0]      buttons=0
t+300ms roots=3 innerHTML lens=[2860,2934,4651] buttons=12
```

So every authored component gets flagged `[RENDER] root empty` / `thin` while its PNG is
15–44KB of correctly-rendered content (a truly blank card is ~4.6KB) and `errs` is 0.
Validate's own screenshot happens later in its sequence than the DOM probe, so **the PNG shows
the truth and the flag does not**. Floor cards escape the race only because they mount trivially
fast.

**Triage rule for a re-sync**: a `bad` entry is only real if `errs > 0` OR
`pngBytes < 5000 && !fallbackCard`. Otherwise read the screenshot before believing the flag.
This is why the final run reports "113 need attention" while every authored component is fine:
76 are unauthored compound sub-parts (see below) and 37 are this race.

Can't be fixed via config: `package-validate.mjs` is a top-level script with no `loadLib` fork
hook, and the mount code lives in `lib/emit.mjs`, which the skill forbids forking. Upstream fix
would be a `waitForFunction` on root population (or `reducedMotion: 'reduce'`) in validate.

## Unauthored compound sub-parts always fail the render check (expected)

~76 components are sub-parts that cannot render alone: `DialogContent`, `SelectItem`,
`TabsList`, `ProgressTrack`, `CommandInput`, `DropdownMenuItem`, … Each throws
`Base UI: <X>RootContext is missing` and shows the floor card. This is correct behaviour —
they're only meaningful inside their parent, which IS previewed. Not a regression; do not
"fix" by authoring standalone previews for them.

## Known render warns (triaged — not new failures)

- `[TOKENS_MISSING]`: `--page-pad`, `--accordion-panel-height`, `--collapsible-panel-height`,
  `--spread`, `--tw` — all set at runtime by components/Tailwind, not by a stylesheet. Expected.
- `[FONT_REMOTE]`: Inter / JetBrains Mono / Ubuntu Mono / Rubik Glitch / Nabla load from Google
  Fonts via `@import` in `styles/index.css`. They resolve at runtime; nothing to ship.
- The `.preset-cursed` theme in `styles/index.css` is a deliberate admin-only joke theme.
  Ignore it; it is not part of the design language.

## Re-sync risks

- **Tailwind compile is a required pre-step.** A re-sync that skips `cfg.buildCmd` builds
  against a stale `.ds-compiled/styles.css` and can ship missing utilities with no error.
- **Both forks are load-bearing.** If a future converter version fixes tsconfig-paths handling
  or makes `source-kit` use `loadLib`, diff the forks against the bundled libs and drop them —
  but never delete `dts.mjs`'s fork without confirming discovery still finds ~189 components.
- **docsMap rots as components are added** — new components silently land in `general`.
  Regenerate it when the component count changes.
- **Bundle inlines phosphor icons** — a phosphor major bump changes 7MB of bundle content.
- `ai-elements/` (~30 chat/AI components) was deliberately excluded from this sync's scope.
  It is NOT a discovery failure. Re-scope by adding it if wanted.
- Previews were authored for ~35 core components; the rest ship the honest floor card and can
  be authored incrementally on any later re-sync.

# Plan: Extract `/vite` design system into `@autumn/ui` (shadcn layout)

## Goal
Extract the reusable design system from `vite/src/components` into a new `packages/ui`
(`@autumn/ui`), restructured to strict shadcn convention (`components/ui/dialog.tsx`,
kebab-case files, flat directory). Rewire all vite imports. Result: one clean, shared
design system reusable across apps (checkout/website migrations are follow-ups).

## Locked decisions
- **Scope**: primitives + shared compositions. App-coupled components stay in vite.
- **Naming**: strict shadcn — flatten `v2/*` subfolders into `components/ui/`, kebab-case
  filenames; keep existing PascalCase exports (`Dialog`, `DialogTrigger`, `Button`).
- **Import style**: single barrel — `import { Dialog, Button } from "@autumn/ui"`.
  (Deliberately overrides the repo "no barrel files" guideline for this package.)
- **Build**: source-only. Export raw `.tsx`; consumers compile via their bundler +
  tsconfig paths (same pattern as `autumn-js` in this repo). No build step.
- **Theme CSS**: move EVERYTHING — entire `index.css` + `styles/*` into the package.
  vite imports a single `@autumn/ui/styles.css`.
- **React**: package peers React 19; bump vite 18 -> 19 in this work.
- **StackSelector / SDKSelector**: stay in vite (depend on `lib/snippets` app config).
- **Checkout**: not migrated this pass (its forked `components/ui/*` left as-is).

## What moves vs stays
Rule: anything importing `@/views`, `@/services`, `@/hooks/queries|stores`,
`@autumn/shared` domain types, or `@/contexts` STAYS in vite.

### MOVES to packages/ui
- All `components/ui/` (19 files) — already pure.
- v2 primitives: `dialogs/Dialog`, `cards/Card`, `tooltips/{Tooltip,ConditionalTooltip}`,
  `selects/{Select,SearchableSelect,TagSelect,CurrencySelect}`,
  `inputs/{Input,LabelInput,LongInput,TagInput,InputGroup}`,
  `checkboxes/{Checkbox,TextCheckbox,AreaCheckbox,IconCheckbox}`,
  `buttons/{Button,IconButton,CopyButton,InlineAction,ShortcutButton,GroupedTabButton,PanelButton,IconTooltipButton}`,
  `badges/{Badge,BetaBadge,IconBadge,StepBadge,StackBadge,SectionTag,PlanTypeBadges}`,
  `radio-groups/{RadioGroup,AreaRadioGroupItem}`,
  `sheets/{Sheet,InlineSheet,SheetBackdrop,SheetCloseButton,InlineSheetPanel,SheetAccordion}`,
  `separator`, `InfoRow`, `LoadingShimmerText`, `form/FormLabel`.
- general primitives: `SmallSpinner`, `PageContainer`, `PageHeader`, `CopyablePre`,
  `TimePickerInput`+`timePickerUtils`, `DateInputUnix`,
  `modal-components/{FieldLabel,InfoTooltip}`, `table-components/ToolbarButton`.
- `cn` from `lib/utils.ts` (only the `cn` helper; domain helpers stay in vite).

### STAYS in vite (app-coupled)
`FeatureSelector`, `SDKSelector`, `StackSelector`, `OpenInStripeButton`, `RoleSelect`,
`ProcessorIcon`, `PlanTypeBadge`, v2 `breadcrumb`, `LineItemsPreview`,
`PreviewTotalsBlock`, `ScopeSelector`/`ScopePreview`, `SheetOverlay`,
`inline-custom-plan-editor/*`, `FeatureSearchDropdown`, `DropdownMenu`,
`SharedSheetComponents`, `EmptyState`, `CustomToaster`, `AdminHover`, `CodeGroup`,
all `general/form/*`, all `general/table/*`.

## Phases

### Phase 1 — Scaffold packages/ui
- Create `packages/ui/{package.json,tsconfig.json,src/}`. Add to root `workspaces`.
- `package.json`: `@autumn/ui`, `"type":"module"`, `sideEffects:["*.css"]`,
  exports: `"."` -> `./src/index.ts`, `"./styles.css"` -> `./src/styles/index.css`.
- peerDeps: `react@^19`, `react-dom@^19`. deps: `@base-ui/react`, `class-variance-authority`,
  `clsx`, `tailwind-merge`, `lucide-react`, `cmdk`, `input-otp`, `react-day-picker`,
  `recharts`, `react-resizable-panels`, `@squircle/*` (only what moved files use).
- `tsconfig.json` mirrors `packages/logging` + `jsx:react-jsx`, React 19 types,
  internal path alias for clean intra-package imports.
- `src/lib/utils.ts` = `cn`.

### Phase 2 — Theme/CSS extraction (everything)
- Move `vite/src/index.css` + `styles/{button,input,typography}.css` + `styles/form/*`
  into `packages/ui/src/styles/`. Create `styles/index.css` that `@import`s them in
  the same order `main.tsx` used.
- vite `main.tsx`: replace the 7 css imports with `import "@autumn/ui/styles.css"`.
- Tailwind v4: ensure the package's class usage is scanned — add `@source` pointing at
  `packages/ui/src` (highest-risk item; verify no classes get purged).

### Phase 3 — Move + rename (deterministic codemod)
- Build a path-map JSON (old path -> `packages/ui/src/components/ui/<kebab>.tsx`).
  Resolve collisions: `v2/CopyButton` vs `general/CopyButton` vs `v2/buttons/CopyButton`.
- `git mv` each file (flatten subdirs, kebab-case).
- Rewrite intra-package imports: `@/lib/utils` -> relative, `@/components/ui/X` -> `./x`,
  `@/components/v2/Y` -> `./y`.
- Create `src/index.ts` barrel re-exporting all moved components.

### Phase 4 — Rewire vite consumers
- Replace every import of a moved file (~500 sites across ui/v2/general consumers)
  with `import { X } from "@autumn/ui"`. Includes app-coupled files that stayed but
  import a moved primitive.
- Add `@autumn/ui` to `vite/package.json` (`workspace:*`) + tsconfig path if needed.

### Phase 5 — React 19 bump in vite
- vite `react`/`react-dom` -> `^19.2`, `@types/react`/`@types/react-dom` -> 19. `bun install`.
- Fix React 19 type breaks (forwardRef -> ref prop, JSX namespace, etc.).

### Phase 6 — Verify & clean
- `cd vite && bun ts` (zero errors), `bun run build`, run `vite/tests`.
- `cd packages/ui && bun ts`.
- `npx ultracite check` changed files; delete emptied v2/general subdirs.
- Smoke test app (dialogs, sheets, selects, dark mode, squircle, theme).

## Risks
- Tailwind v4 cross-package content scanning (purged classes) — verify early.
- `@base-ui/react` version pin (vite ^1.4.1).
- ~500 import rewrites — done via reviewable deterministic codemod, one diff.
- React 19 upgrade surface in vite.

# Autumn UI — how to build with this design system

Autumn is a billing/pricing platform; this is its dashboard design system. Components are
shadcn-shaped but built on **`@base-ui/react`** (not Radix) — prop names differ from stock
shadcn, so read the per-component `.d.ts` before assuming an API.

## Setup and wrapping

There is **no theme provider**. Tokens are plain CSS custom properties on `:root` in the
stylesheet, so components are styled as soon as `styles.css` is loaded — no wrapper needed
for color or typography.

Two wrappers matter:

- **`TooltipProvider`** — required around any tooltip-based component (`Tooltip`,
  `InfoTooltip`, `ConditionalTooltip`, `IconTooltipButton`). Without it they throw.
- **`PageContainer`** — the standard page shell (max-width, gutters, vertical rhythm).
  Use it as the outermost element of a page, usually with `PageHeader` as its first child.

**Dark mode** is a `.dark` class on an ancestor (`@custom-variant dark (&:is(.dark *))`),
not a media query. Two extra presets exist as ancestor classes: `.preset-modern`
(higher-contrast neutrals). Default is light.

## Styling idiom: Tailwind v4 utilities over semantic tokens

Style your own layout glue with Tailwind utilities bound to Autumn's semantic tokens.
**Never hardcode hex colors** — always go through a token. The real vocabulary:

| Purpose | Classes |
|---|---|
| Surfaces | `bg-background`, `bg-outer-background`, `bg-card`, `bg-muted`, `bg-input-background`, `bg-interactive-secondary` (+ `-hover`) |
| Text | `text-foreground`, `text-muted-foreground`, `text-tertiary-foreground`, `text-subtle`, `text-placeholder` |
| Brand / intent | `bg-primary`, `text-primary`, `text-primary-foreground`, `bg-destructive`, `text-destructive`, `bg-sandbox` |
| Borders | `border-border`, `border-input` |
| Radius | `rounded-sm|md|lg|xl|2xl` (all derive from `--radius: 6px`) |
| Shadow | `shadow-sm`, `shadow-md`, `shadow-lg`, `shadow-card` |

Font sizes are **overridden to a compact scale**: `text-xs` 12px, `text-sm` 13px,
`text-md` 15px, `text-lg` 17px, `text-xl` 20px. Body copy is 13px — this UI is denser
than Tailwind defaults. Font weights: `font-normal` is 450, `font-medium` 500.

Prefer the **semantic typography classes** over raw size+weight+color combos:
`text-giga` (23px), `text-main` / `text-main-sec` (17px), `text-sub` / `text-sub-secondary`
(15px), `text-body` / `text-body-highlight` / `text-body-secondary` (13px), `text-tiny`,
`text-tiny-id` (monospace ids), plus form-specific `text-form-label`, `text-form-text`,
`text-form-placeholder`.

Other real component classes: `h-input` (standard control height), `input-shadow`,
`btn-primary-shadow`, `btn-secondary-shadow`, `btn-destructive-shadow`, `panel`,
`panel-button`, `font-mono`.

Fonts: **Inter** (UI), **JetBrains Mono** / **Ubuntu Mono** (code), loaded remotely.

## Where the truth lives

- `_ds/<folder>/styles.css` and its `@import` closure — the real tokens, typography classes,
  and form/button classes. Read it before inventing a class name.
- `components/<group>/<Name>/<Name>.d.ts` — the API contract.
- `components/<group>/<Name>/<Name>.prompt.md` — per-component usage.

Groups: **`ui/`** (shadcn-shaped primitives), **`general/`** (Autumn-specific pieces —
`PageHeader`, `IconButton`, `SearchableSelect`, sheet parts, badges), **`table/`**.

## Building a page

```tsx
<PageContainer>
  <PageHeader
    icon={<UsersIcon size={16} weight="fill" className="text-subtle" />}
    title="Customers"
  >
    <Button variant="secondary" size="sm">Filter</Button>
    <Button size="sm">Create customer</Button>
  </PageHeader>

  <div className="flex flex-col gap-2">
    <Card>
      <CardHeader>
        <CardTitle>Pro plan</CardTitle>
      </CardHeader>
      <CardContent className="text-body">
        $49/mo · 128 seats active
      </CardContent>
    </Card>
  </div>
</PageContainer>
```

`Button` variants: `primary` (default), `secondary`, `muted`, `skeleton`, `destructive`,
`dotted`. Sizes: `default`, `sm`, `mini`, `icon`. It also takes `isLoading`.

Icons come from `@phosphor-icons/react` (bundled) — `<GearIcon size={16} weight="fill" />`.
`lucide-react` is also available.

## The data-table system

Two different things share the `Table` name:

- **`Table`** (in `ui/`) — the plain HTML table primitive (`TableHeader`, `TableRow`,
  `TableHead`, `TableBody`, `TableCell`, `TableCaption`). Use for simple static tables.
- **`DataTable`** — the composed data-table namespace (`DataTable.Provider`,
  `.Toolbar`, `.Content`, `.Header`, `.Body`, `.PaginationFooter`, …), backed by TanStack
  Table. Exported as `DataTable` here to avoid colliding with the primitive; it has no
  preview card, but it is importable. `TableProvider`, `TableDropdownMenuCell`,
  `CursorPagination`, and `useCursorPagination` are also available.

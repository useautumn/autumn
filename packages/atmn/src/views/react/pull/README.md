# Pull View - Beautiful CLI UI

A gorgeous, card-based UI for the `atmn pull` command built with React Ink.

## Structure

```
pull/
├── Pull.tsx                    # Main view with state management
└── components/
    ├── Card.tsx                # Rounded border card container
    ├── LoadingText.tsx         # Spinner with text
    ├── KeyValue.tsx            # Label: value display
    ├── FeatureRow.tsx          # Single feature with ✓ and type
    ├── PlanRow.tsx             # Single plan with ✓ and feature count
    ├── FileRow.tsx             # Generated file with spinner/✓
    └── index.ts                # Component exports
```

## Visual Design

```
╭───────────────────────────────────────╮
│ 🍂 Pulling from Autumn                │
╰───────────────────────────────────────╯

╭─── 📦 Organization ──────────────────╮
│  Name:        Your Organization      │
│  Environment: Sandbox                │
╰──────────────────────────────────────╯

╭─── 🎯 Features (12) ─────────────────╮
│  ✓ api_calls      metered            │
│  ✓ seats          metered            │
│  ✓ support        boolean            │
│  ✓ credits        credit_system      │
│  ... 8 more                          │
╰──────────────────────────────────────╯

╭─── 📋 Plans (5) ─────────────────────╮
│  ✓ Free           0 features         │
│  ✓ Starter        3 features         │
│  ✓ Pro            8 features         │
│  ✓ Enterprise    12 features         │
│  ... 1 more                          │
╰──────────────────────────────────────╯

╭─── 📝 Generated ─────────────────────╮
│  ✓ autumn.config.ts      247 lines   │
│  ✓ @useautumn-sdk.d.ts    42 lines   │
╰──────────────────────────────────────╯

✨ Done in 1.2s
```

## Features

### Progressive Rendering
Cards appear as data loads, creating a smooth experience:
1. Header → Organization → Features → Plans → Files → Done

### Spinners
Loading states use Ink spinners for visual feedback:
- `⠋ Fetching...`
- `⠙ Generating...`

### Stage Management
```typescript
type Stage = "org" | "features" | "plans" | "files" | "done";
```

Each stage shows appropriate loading/completed states.

### TTY Detection
```typescript
if (process.stdout.isTTY) {
  // Beautiful Ink UI
  render(<PullView />);
} else {
  // Plain text for CI/agents
  console.log("Pulling from Autumn...");
}
```

## Component Architecture

### Card Component
Reusable rounded border container with title:
```tsx
<Card title="🎯 Features (12)">
  <FeatureRow feature={...} />
  <FeatureRow feature={...} />
</Card>
```

### Row Components
Display individual items with consistent styling:
- **FeatureRow**: `✓ feature_id  type`
- **PlanRow**: `✓ plan_name  X features`
- **FileRow**: `✓/⠋ filename  X lines`

### Stateless Components
All components are pure/stateless except `Pull.tsx`:
- Easy to test
- Reusable
- Predictable behavior

## Testing

To see the beautiful UI in a real TTY:

```bash
cd atmn-tests
./test-pull-ui.sh
```

Or run directly:
```bash
cd atmn-tests
atmn pull
```

## Future Enhancements

Potential additions:
- **Diff view** - Show what changed since last pull
- **Interactive mode** - Select which features/plans to pull
- **Progress bar** - Instead of spinners for large datasets
- **Color themes** - User-configurable colors
- **Export summary** - Generate JSON/markdown summary

## Dependencies

- `ink` - React for CLIs
- `ink-spinner` - Loading spinners
- `react` - Component architecture

All components are TypeScript with full type safety.

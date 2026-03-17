# ATMN CLI - Code Conventions

## Directory Structure

All code is in the `src/` directory. The legacy `source/` directory has been fully migrated.

```
atmn/
├── src/
│   ├── cli.tsx                # Main CLI entry point
│   ├── constants.ts           # BACKEND_URL, FRONTEND_URL, DEFAULT_CONFIG
│   │
│   ├── compose/               # DSL builders for plans/features (public API)
│   │   ├── index.ts           # Package exports (Plan, Feature, plan(), feature(), etc.)
│   │   ├── models/            # Type definitions (Plan, Feature, PlanFeature)
│   │   └── builders/          # Builder functions (plan(), feature(), planFeature())
│   │
│   ├── commands/              # CLI commands (each in its own folder)
│   │   ├── auth/              # Auth/login command
│   │   ├── pull/              # Pull command
│   │   ├── push/              # Push command
│   │   └── nuke/              # Nuke command
│   │
│   ├── lib/                   # Shared libraries
│   │   ├── api/               # API client and endpoints
│   │   │   ├── client.ts      # HTTP client
│   │   │   ├── endpoints/     # API endpoint functions
│   │   │   └── types/         # API response types
│   │   ├── hooks/             # Custom React hooks
│   │   ├── transforms/        # Data transformation (apiToSdk, sdkToApi, sdkToCode)
│   │   ├── env/               # Environment context (--local, --prod flags)
│   │   ├── constants/         # Shared constants, template data
│   │   └── utils.ts           # Shared utilities
│   │
│   └── views/                 # UI templates
│       ├── html/              # HTML templates (OAuth callbacks)
│       └── react/             # React/Ink components
│           ├── components/    # Shared UI components
│           ├── init/          # Init flow
│           ├── pull/          # Pull UI
│           ├── push/          # Push UI
│           └── nuke/          # Nuke UI
│
├── test/                      # Tests
└── dist/                      # Build output
```

## Package Exports

The `atmn` package exports the compose DSL for use in `autumn.config.ts`:

```ts
// Users import from 'atmn'
import { plan, feature, planFeature, type Plan, type Feature } from 'atmn';
```

These exports come from `src/compose/index.ts`.

## Architecture Conventions

### Commands (`src/commands/<name>/`)

Each command should have its own folder with:
- Main command file(s) with the command logic
- Supporting files for complex operations (e.g., `oauth.ts` for auth)
- Types and constants specific to that command

### Views (`src/views/`)

UI templates organized by type:
- `html/` - HTML templates (for browser callbacks, etc.)
- `react/` - React/Ink components organized by feature

### Shared Libraries (`src/lib/`)

- `api/` - API client, endpoint functions, and response types
- `hooks/` - Custom React hooks (useOrganization, usePush, usePull, etc.)
- `transforms/` - Data transformation functions between API/SDK/Code formats
- `env/` - CLI context (--local, --prod flag handling)
- `constants/` - Shared constants and template data
- `utils.ts` - Shared utility functions

## Import Conventions

- Use `.js` extensions in imports (required for ESM)
- Import compose types from `../../compose/models/index.js`
- Import API functions from `../../lib/api/endpoints/index.js`
- Import utilities from `../../lib/utils.js`

## OAuth Flow

The auth command uses OAuth 2.1 PKCE:
1. Local HTTP server starts on port `31448` (or next available up to `31452`)
2. Browser opens to backend authorize URL with PKCE challenge
3. User authenticates and selects organization
4. Callback received with authorization code
5. Code exchanged for access token
6. Access token used to create API keys via `/cli/api-keys` endpoint
7. Keys saved to `.env` file

Key constants:
- `CLI_CLIENT_ID`: `qncNuaPFAEBwzCypjFopNCGPHQDqkchp`
- `OAUTH_PORTS`: `31448-31452` (5 ports, tries each in sequence if previous is in use)

## React Component Conventions (`src/views/react/`)

When React files grow large, use folder-based decomposition:

1. **Create a folder with the component's name** - Replace `Component.tsx` with `Component/` folder
2. **Move parent into folder** - Place main component in `Component/Component.tsx`
3. **Extract children as siblings** - Create separate files for sub-components (e.g., `Component/SubComponent.tsx`)
4. **Apply recursively** - If children grow large, repeat the pattern for them
5. **Extract shared components** - Move frequently reused components to `react/components/`

**Example:**
```
react/
├── InitFlow.tsx              # Original file (300+ lines)
│
# After decomposition:
├── init/
│   ├── InitFlow.tsx          # Main orchestrator
│   └── steps/
│       ├── AuthStep.tsx      # Step 1
│       ├── StripeStep.tsx    # Step 2
│       └── ConfigStep.tsx    # Step 3
│
└── components/               # Shared across multiple views
    ├── StepHeader.tsx
    ├── StatusLine.tsx
    └── SelectMenu.tsx
```

**Useful Ink Components:**
- `ink-select-input` - Interactive select menus with arrow key navigation
- `ink-confirm-input` - Yes/No confirmation prompts
- `ink-spinner` - Loading spinners
- `ink-text-input` - Text input fields

## Build

```bash
pnpm build    # Build with Bun
pnpm dev      # Watch mode
pnpm test     # Run tests
```

Entry point is `src/cli.tsx` for the CLI and `src/compose/index.ts` for the package exports.

## Code Separation Rules

### .tsx Files (Components)
- **ONLY rendering logic** - No API calls, no business logic, no data transformation
- Import and use custom hooks for all data/state management
- No `useEffect` + `async/await` patterns
- No JSON boilerplate or large data constants

### .ts Files (Logic)
- All business logic, API calls, data transformation
- Custom hooks (`useX`) for stateful logic
- Utility functions for pure transformations
- Constants and configuration data

### Data Fetching
- **Always use TanStack Query for queries** - No `useEffect` + `async/await` for data fetching
- Create reusable hooks: `useOrganization`, `usePull`, etc.
- **Use TanStack Query for**: Data that should be cached/refetched (org info, lists, etc.)
- **Use useState + useEffect for**: One-time operations/mutations (pull, push, nuke)
- Hooks return consistent patterns: `{ data, isLoading, error }` or `{ ...data, isLoading, error }`

### Directory Structure for Logic

```
src/
├── lib/
│   ├── api/                    # API client and endpoints
│   │   ├── client.ts
│   │   └── endpoints/
│   ├── hooks/                  # Custom React hooks
│   │   ├── useOrganization.ts  # Org info hook
│   │   ├── usePull.ts          # Pull operation hook
│   │   └── index.ts
│   ├── utils/                  # Pure utility functions
│   │   └── files.ts
│   └── constants/              # Shared constants, template data
│       └── templates.ts
└── views/react/                # UI components (rendering only)
```

### Example: Good vs Bad

**Bad - Logic in .tsx:**
```tsx
// Component.tsx
export function MyComponent() {
  const [data, setData] = useState(null);
  
  useEffect(() => {
    async function fetchData() {
      const result = await fetch('/api/data');
      setData(result);
    }
    fetchData();
  }, []);
  
  return <div>{data}</div>;
}
```

**Good - Logic in hook, .tsx only renders:**
```tsx
// hooks/useMyData.ts
export function useMyData() {
  return useQuery({
    queryKey: ['myData'],
    queryFn: () => fetchMyData(),
  });
}

// Component.tsx
export function MyComponent() {
  const { data, isLoading, error } = useMyData();
  
  if (isLoading) return <Loading />;
  if (error) return <Error message={error.message} />;
  return <div>{data}</div>;
}
```

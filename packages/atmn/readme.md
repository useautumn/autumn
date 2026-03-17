# atmn

The CLI for [Autumn](https://useautumn.com) — define your pricing in code, sync it to Autumn, and keep everything in version control.

## Install

```bash
npm install -g atmn
```

Or run directly:

```bash
npx atmn <command>
```

## Quick Start

```bash
atmn login          # Authenticate via OAuth
atmn init           # Scaffold a project from a template
atmn push           # Deploy your config to Autumn
atmn pull           # Pull changes & generate SDK types
```

## Templates

`atmn init` offers starter templates for common pricing models:

- **OpenAI** — Credit system with model tiers
- **T3 Chat** — Seats + message limits
- **Railway** — Resource-based usage pricing
- **Linear** — Feature flags + usage controls

## What It Does

You define features and plans in an `autumn.config.ts` file. The CLI syncs that config with your Autumn account — push to deploy, pull to fetch updates. It also generates TypeScript definitions so your SDK calls are type-safe.

```ts
import { feature, plan, planFeature } from 'atmn';

export const messages = feature({
  id: 'messages',
  name: 'AI Messages',
  type: 'metered',
  consumable: true,
});

export const pro = plan({
  id: 'pro',
  name: 'Pro',
  price: { amount: 2000, interval: 'month' },
  items: [
    planFeature({
      feature_id: messages.id,
      included: 1000,
      reset: { interval: 'month' },
    }),
  ],
});
```

## Commands

### Authentication

| Command | Description |
|---------|-------------|
| `atmn login` | Authenticate with Autumn (OAuth 2.0) |
| `atmn logout` | Remove API keys from `.env` |
| `atmn env` | Show current org and environment |

### Configuration

| Command | Description |
|---------|-------------|
| `atmn init` | Initialize a project with a starter template |
| `atmn push` | Push local config to Autumn |
| `atmn pull` | Pull config from Autumn and generate SDK types |
| `atmn preview` | Preview plans locally (no API calls) |
| `atmn config` | View and set global CLI configuration |

### Data

| Command | Description |
|---------|-------------|
| `atmn customers` | Browse and inspect customers |
| `atmn plans` | Browse and inspect plans (alias: `products`) |
| `atmn features` | Browse and inspect features |
| `atmn events` | Browse and analyze usage events |

### Utility

| Command | Description |
|---------|-------------|
| `atmn nuke` | Permanently delete all sandbox data |
| `atmn version` | Show CLI version |

## Global Flags

| Flag | Description |
|------|-------------|
| `-p, --prod` | Use production environment (default: sandbox) |
| `-c, --config <path>` | Path to config file (default: `autumn.config.ts`) |
| `--headless` | Force non-interactive mode (for CI/agents) |

Flags combine: `atmn push -p` pushes to production.

## Push & Pull

**Push** analyzes your local config against remote state, shows you exactly what will change, and syncs it:

```bash
atmn push           # Deploy to sandbox
atmn push --prod    # Deploy to production (extra confirmation)
atmn push --yes     # Auto-confirm (for CI/CD)
```

**Pull** fetches your config and generates typed SDK definitions:

```bash
atmn pull           # Smart in-place update
```


### Declaration File

Pull generates `@useautumn-sdk.d.ts` by default. To skip it:

```bash
atmn pull --no-declaration-file
```

Or set it globally:

```bash
atmn config --global noDeclarationFile true
```

## Data Commands

All data commands have an interactive mode (default) and a headless mode for scripting:

```bash
atmn customers                              # Interactive browser
atmn customers --headless --format json     # JSON output
atmn customers --headless --format csv      # CSV export
atmn customers --headless --id "cus_123"    # Specific customer
```

Events support aggregation:

```bash
atmn events --mode aggregate --bin day --time 30d
atmn events --customer "cus_123" --feature "messages" --time 7d
```

## Global Config

Manage persistent CLI settings:

```bash
atmn config                              # Show config file location and keys
atmn config --global                     # Same as above
atmn config --global noDeclarationFile   # Read a key
atmn config --global noDeclarationFile true   # Set a key
```

## CI/CD

The CLI auto-detects non-TTY environments and switches to headless mode. Set your API keys as environment variables:

```yaml
# GitHub Actions
- name: Deploy to Autumn
  run: atmn push --prod --yes
  env:
    AUTUMN_PROD_SECRET_KEY: ${{ secrets.AUTUMN_PROD_SECRET_KEY }}
```

## Links

- [Documentation](https://docs.useautumn.com)
- [Dashboard](https://app.useautumn.com)
- [Main GitHub](https://github.com/useautumn/autumn)
- [CLI & SDKs GitHub](https://github.com/useautumn/typescript)

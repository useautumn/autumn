# atmn

The CLI for [Autumn](https://useautumn.com) — define your pricing in code, sync it to Autumn, and keep everything in version control.

## Install

```bash
npm install atmn
```

Or run directly:

```bash
npx atmn <command>
```

## Quick Start

```bash
atmn login          # Authenticate with Autumn
atmn init           # Set up your project
atmn push           # Preview your config changes
atmn push --yes     # Apply the changes to Autumn
atmn pull           # Pull remote changes into your config
```

## What It Does

You define features and plans in an `autumn.config.ts` file. Use `atmn push` to preview changes, `atmn push --yes` to apply them, and `atmn pull` to fetch updates from your Autumn account.

```ts
import { atmn, feature, plan } from "atmn";

export default atmn({
  features: [
    feature({
      featureId: "messages",
      name: "AI Messages",
      type: "metered",
      consumable: true,
    }),
  ],
  plans: [
    plan({
      planId: "pro",
      versionSlug: "v1",
      active: true,
      name: "Pro",
      price: { amount: 20, interval: "month" },
      items: [
        {
          featureId: "messages",
          included: 1000,
          reset: { interval: "month" },
        },
      ],
    }),
  ],
});
```

## Commands

Run `atmn --help` or `atmn <command> --help` for the current options.

| Command | Description |
|---------|-------------|
| `atmn login` | Authenticate with Autumn |
| `atmn env` | Show the current organization and environment |
| `atmn init` | Set up a project |
| `atmn push` | Preview local configuration changes; add `--yes` to apply them |
| `atmn pull` | Pull remote configuration into local files |
| `atmn sandbox` | Manage sandboxes |
| `atmn reset` | Reset sandbox data |
| `atmn skills` | Manage bundled agent skills |
| `atmn api` | Call Autumn's public API |

## Global Flags

| Flag | Description |
|------|-------------|
| `-p, --prod` | Use production instead of sandbox |
| `--sandbox <sandboxId>` | Target a specific sandbox |
| `-c, --config <path>` | Config file or folder |
| `--headless` | Never prompt (the default outside a TTY) |

## Push & Pull

Push only previews changes unless you pass `--yes`, including in an interactive terminal:

```bash
atmn push                # Preview sandbox changes
atmn push --prod         # Preview production changes
atmn push --yes          # Apply sandbox changes
atmn push --prod --yes   # Apply production changes
```

Pull updates configuration in place:

```bash
atmn pull
```

## CI/CD

Set your API key as an environment variable:

```yaml
- name: Deploy to Autumn
  run: npx atmn push --prod --yes
  env:
    AUTUMN_PROD_SECRET_KEY: ${{ secrets.AUTUMN_PROD_SECRET_KEY }}
```

## Links

- [Documentation](https://docs.useautumn.com)
- [Dashboard](https://app.useautumn.com)
- [Main GitHub](https://github.com/useautumn/autumn)
- [CLI & SDKs GitHub](https://github.com/useautumn/typescript)

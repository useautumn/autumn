# Autumn Slack Bot

Autumn's Slack bot where users interact with `@Autumn` via natural language for all billing operations. No billing slash commands, just an AI agent with confirmation buttons for mutations.

This app lives at `apps/autumn` inside the main Autumn monorepo.

## Tech Stack

- Runtime: Bun
- Server: Hono
- Bot Framework: Chat SDK (`chat`, `@chat-adapter/slack`)
- State: Redis (via `@chat-adapter/state-redis` + `ioredis`)
- Billing API: `autumn-js@beta` (Autumn v2 SDK)
- AI Agent: Anthropic Claude (via `@anthropic-ai/sdk`)
- Webhook Verification: Svix

## Architecture

```
src/
├── index.ts           Hono server entry point
├── bot.ts             Chat SDK instance, event handlers, App Home
├── config.ts          Env validation
├── routes/
│   ├── webhooks.ts    Chat SDK webhook handler (/webhooks/slack)
│   ├── autumn.ts      Autumn webhooks + Svix verification + alert routing
│   ├── install.ts     Slack OAuth + welcome DM (/install/slack)
│   └── connect.ts     Autumn OAuth (/connect)
├── commands/
│   ├── router.ts      /connect + /disconnect only
│   ├── connect.ts     /connect (Autumn OAuth onboarding)
│   └── disconnect.ts  /disconnect
├── agent/
│   ├── handler.ts     @Autumn mention -> Claude agent loop + confirm cards
│   ├── tools.ts       Tool definitions (defineTool helper, read/mutating split)
│   ├── executor.ts    Tool execution (read + computed)
│   ├── confirm.ts     Confirmation execution (action registry + successCard)
│   └── shared.ts      parseApiError, str, num utilities
├── cards/
│   └── alert.ts       Webhook alert cards
├── services/
│   ├── autumn.ts      Per-tenant Autumn SDK factory
│   ├── workspace.ts   Redis workspace store (encrypted)
│   ├── encryption.ts  AES-256-GCM
│   └── renewals.ts    Upcoming renewal computation
├── lib/
│   ├── slack.ts       Workspace ID extraction + error helpers
│   └── redis.ts       Redis singleton
└── utils/
    └── formatters.ts  formatNumber, parseDuration
```

## Agent-First

All billing operations go through `@Autumn` mentions with 26 tools (16 read/computed, 10 mutating) where mutations trigger Confirm/Cancel buttons automatically and ambiguous customer names are disambiguated before acting.

## Multi-Tenant

Each Slack workspace stores encrypted credentials in Redis that get decrypted per-event to create a per-tenant Autumn SDK instance, with channel-based access control.

## Onboarding

1. Install via Slack OAuth -> welcome DM with Connect button
2. `/connect` triggers Autumn OAuth (PKCE)
3. Prod API key is provisioned automatically
4. App Home shows connection status

## Auth

Users connect via `/connect` which triggers Autumn's OAuth flow. No API keys are pasted in chat.

## Workspace Config

```typescript
type WorkspaceConfig = {
  workspaceId: string;
  apiKey: string | null;
  orgSlug: string;
  orgName: string;
  commandChannels: string[];
  alertChannel: string | null;
  slackBotToken: string | null;
  webhookSecret: string | null;
  installedAt: number;
  installedBotUserId: string | null;
  connectedByUserId: string | null;
};
```

## Commands

- `bun setup` -- Generate `.env` for the Slack app
- `docker compose -f docker-compose.dev.yml up -d` -- Start Redis from repo root (Windows)
- `docker compose -f docker-compose.unix.yml up -d` -- Start Redis from repo root (macOS/Linux)
- `bun dev` -- Start dev server with hot reload
- `bun start` -- Start production server
- `bun run check` -- Lint and format check
- `bun run typecheck` -- TypeScript type checking

## Style

- Biome for formatting (tabs, double quotes, semicolons)
- Chat SDK function-call API for cards (no JSX)
- `.ts` extensions only
- No doc comments, no decorative comment separators

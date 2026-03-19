# Autumn Slack Bot

Mention `@Autumn` in any Slack channel to manage customers, subscriptions, usage, and billing through natural language with confirmation buttons for anything that mutates data.

Originally written by [Kyle Graham Matzen](https://github.com/kylegrahammatzen) and now maintained by Autumn.

## Getting Started

### Prerequisites

- Bun 1.3+
- Redis
- A Slack workspace where you can install apps
- An [Autumn](https://useautumn.com) account

### Setup

```bash
git clone https://github.com/useautumn/autumn.git
cd autumn
bun install
cd apps/autumn
bun setup
docker compose -f ../../docker-compose.dev.yml up -d    # Windows
# or
docker compose -f ../../docker-compose.unix.yml up -d   # macOS/Linux
```

`bun setup` generates an encryption key and creates your `.env` file. Fill in your Slack and Autumn credentials, then run `bun dev` and expose it with a tunnel like `ngrok http 3000` so Slack can reach your local server.

## Usage

After installing, Autumn sends a welcome DM with a link to connect your Autumn account via OAuth. Once connected you can mention `@Autumn` anywhere to interact with billing in natural language.

```
@Autumn what plan is acme on?
@Autumn show me usage for customer acme
@Autumn grant acme 5000 messages
@Autumn attach the Pro plan to acme at $29.99/mo
@Autumn who's renewing in the next 7 days?
```

The only slash commands are `/connect` to link your Autumn account and `/disconnect` to remove it, since everything else goes through `@Autumn`.

## Webhook Alerts

Autumn receives billing events via Svix and posts alert cards to a configured Slack channel covering subscription changes, plan upgrades and downgrades, cancellations, usage thresholds, payment issues, and renewals.

## Auth

Teams connect through `/connect` which kicks off Autumn's OAuth flow with PKCE. The prod API key is provisioned automatically and stored AES-256-GCM encrypted in Redis, so no credentials are ever pasted in chat.

## Architecture

```
src/
├── index.ts           Hono server entry point
├── bot.ts             Chat SDK instance and event handlers
├── config.ts          Env validation
├── routes/
│   ├── webhooks.ts    Chat SDK webhook handler (/webhooks/slack)
│   ├── autumn.ts      Autumn webhook receiver and alert routing
│   ├── install.ts     Slack OAuth install flow
│   └── connect.ts     Autumn OAuth connect flow
├── commands/
│   ├── router.ts      /connect and /disconnect parser
│   ├── connect.ts     Connect workspace to Autumn
│   └── disconnect.ts  Disconnect workspace from Autumn
├── agent/
│   ├── handler.ts     Mention and message handlers with Claude agent loop
│   ├── tools.ts       Tool definitions for Claude
│   ├── executor.ts    Tool execution
│   └── confirm.ts     Confirmation flow for mutating actions
├── cards/
│   └── alert.ts       Webhook alert cards
├── services/
│   ├── autumn.ts      Per-tenant Autumn SDK factory
│   ├── workspace.ts   Redis workspace credential store
│   └── encryption.ts  AES-256-GCM encryption for API keys
└── lib/
    ├── redis.ts       Redis client
    └── slack.ts       Slack utilities
```

## License

Licensed under the MIT License. See [LICENSE](../../LICENSE).

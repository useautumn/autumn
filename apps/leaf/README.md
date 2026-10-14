# Autumn Leaf

Autumn's AI service: the Slack chat bot plus the hosted MCP routes (`src/mcp/mcpRouter.ts`).

Local Slack testing uses a normal Slack app in a development workspace. Keep the app undistributed while testing.

## Slack test app

1. Start the stable local tunnel for the server. It forwards Slack requests to the chat app in local development:

```sh
bun run chat:tunnel
```

2. Start Autumn with the same public URL:

```sh
AUTUMN_PUBLIC_API_URL=https://c.autumn.ngrok.app bun d
```

`bun d` derives `CHAT_URL`, `SLACK_BOT_URL`, and `SLACK_REDIRECT_URI` from
`AUTUMN_PUBLIC_API_URL`, so the Slack OAuth redirect becomes
`https://c.autumn.ngrok.app/slack/oauth/callback`. This exact URL must be in
the Slack app's OAuth redirect URLs.

The chat SDK stores its own subscriptions, locks, and queues in Postgres. By
default it uses the same `DATABASE_URL` host with the database name changed to
`chat`; set `CHAT_STATE_DATABASE_URL` to override this. `bun dev:services up`
creates the local `chat` database. The `@chat-adapter/state-pg` package creates
its state tables automatically on connect, so there is no separate migration
command for the chat state database.

eve's durable workflow world also lives in the chat database:

| Variable | Carries |
| --- | --- |
| `CHAT_DATABASE_URL` | Every world query. In prod this is PlanetScale's PgBouncer (`:6432`, transaction mode). |
| `CHAT_DATABASE_DIRECT_URL` | Optional. The world's one stream `LISTEN` connection, direct to Postgres (`:5432`). Transaction poolers drop `LISTEN`. |

At boot leaf proves that a `NOTIFY` sent through `CHAT_DATABASE_URL` reaches a
`LISTEN` on `CHAT_DATABASE_DIRECT_URL` (or on `CHAT_DATABASE_URL` when the direct
URL is unset). If it doesn't, eve falls back to its local world and
`leaf.eve_server_starting` logs `durable_journal: false`. The world module is
`agent/lib/workflowWorld/workflowWorld.ts`. To reproduce prod's bouncer setup,
see `tests/integration/pgbouncerWorld.test.ts`.

3. Create a Slack app at https://api.slack.com/apps using `slack-manifest.example.json`.

For production, use `slack-manifest.prod.json`. It points Slack at `https://api.useautumn.com/slack/*`, which the API proxies to the chat service.

4. Copy the Slack app credentials into the local environment:

```sh
SLACK_CLIENT_ID=...
SLACK_CLIENT_SECRET=...
SLACK_SIGNING_SECRET=...
```

5. In Autumn, open Settings -> Integrations and click Add Slack.

6. Test in Slack by DMing the app:

```txt
list customers
```

For billing changes, the app should post a preview with Approve and Cancel buttons before calling a write tool.

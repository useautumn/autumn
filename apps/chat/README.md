# Autumn Chat

Local Slack testing uses a normal Slack app in a development workspace. Keep the app undistributed while testing.

## Slack test app

1. Start the stable local tunnel for the server. It forwards Slack requests to the chat app in local development:

```sh
bun run chat:tunnel
```

2. Start Autumn with the same public URL:

```sh
CHAT_URL=https://c.autumn.ngrok.app SLACK_BOT_URL=https://c.autumn.ngrok.app bun d
```

The chat SDK stores its own subscriptions, locks, and queues in Postgres. By
default it uses the same `DATABASE_URL` host with the database name changed to
`chat`; set `CHAT_STATE_DATABASE_URL` to override this.

3. Create a Slack app at https://api.slack.com/apps using `slack-manifest.example.json`.

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

import { Hono } from "hono";
import { chatAdapterNames } from "./bot.js";
import { env } from "./lib/env.js";
import { slackRoutes } from "./providers/slack/routes.js";

const app = new Hono();

app.get("/health", (c) => c.json({ ok: true }));
app.route("/slack", slackRoutes);

Bun.serve({
	port: env.PORT,
	fetch: app.fetch,
});

console.log("Chat listening", { port: env.PORT, adapters: chatAdapterNames });

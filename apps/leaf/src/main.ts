import { createConsoleLogger } from "@autumn/mcp";
import type { HttpBindings } from "@hono/node-server";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { chatAdapterNames } from "./bot.js";
import { env } from "./lib/env.js";
import { registerMcpRoutes } from "./mcp/http.js";
import { slackRoutes } from "./providers/slack/routes.js";

const app = new Hono<{ Bindings: HttpBindings }>();

app.use("*", async (c, next) => {
	c.header("Access-Control-Allow-Origin", "*");
	c.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
	c.header("Access-Control-Allow-Headers", "*");
	return c.req.method === "OPTIONS" ? c.body(null, 204) : next();
});

app.get("/health", (c) => c.json({ ok: true }));

registerMcpRoutes(app, {
	"oauth-enabled": true,
	"oauth-environment": env.MCP_OAUTH_ENVIRONMENT,
	"server-url": env.BETTER_AUTH_URL,
	logger: createConsoleLogger("info"),
});

app.route("/slack", slackRoutes);

serve(
	{
		fetch: app.fetch,
		hostname: "0.0.0.0",
		port: env.PORT,
	},
	({ address, port }) => {
		console.log("Chat listening", {
			host: `${address}:${port}`,
			adapters: chatAdapterNames,
		});
	},
);

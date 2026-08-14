import type { HttpBindings } from "@hono/node-server";
import { Hono } from "hono";
import { env } from "../lib/env.js";
import { logger } from "../lib/logger.js";
import { createMcpRouter } from "../mcp/mcpRouter.js";
import { slackRoutes } from "../providers/slack/routes.js";
import { webRoutes } from "../providers/web/routes.js";

export const createLeafApp = () => {
	const app = new Hono<{ Bindings: HttpBindings }>();

	app.use("*", async (c, next) => {
		const origin = c.req.header("origin");
		if (origin) {
			c.header("Access-Control-Allow-Origin", origin);
			c.header("Access-Control-Allow-Credentials", "true");
			c.header("Vary", "Origin");
		} else {
			c.header("Access-Control-Allow-Origin", "*");
		}
		c.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
		c.header(
			"Access-Control-Allow-Headers",
			c.req.header("access-control-request-headers") ??
				"content-type, authorization, x-client-type, x-autumn-environment",
		);
		return c.req.method === "OPTIONS" ? c.body(null, 204) : next();
	});

	app.get("/health", (c) => c.json({ ok: true }));
	app.route(
		"",
		createMcpRouter({
			"oauth-enabled": true,
			"oauth-environment": env.MCP_OAUTH_ENVIRONMENT,
			"server-url": env.AUTUMN_API_URL,
			logger,
			resourceUrl: new URL("/mcp", env.MCP_SERVER_URL).href,
		}),
	);
	app.route("/slack", slackRoutes);
	app.route("/agent", webRoutes);

	return app;
};

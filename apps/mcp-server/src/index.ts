import { serve } from "@hono/node-server";
import {
	createConsoleLogger,
	type OAuthEnvironment,
} from "@autumn/mcp";
import { createMcpHttpApp } from "./http.js";

const port = Number.parseInt(process.env.PORT ?? process.env.MCP_PORT ?? "2718", 10);
const serverURL =
	process.env.MCP_SERVER_URL ??
	(process.env.NODE_ENV === "production"
		? "https://api.useautumn.com"
		: "http://localhost:8080");
const oauthEnvironment: OAuthEnvironment =
	process.env.MCP_OAUTH_ENVIRONMENT === "live" ? "live" : "sandbox";
const logger = createConsoleLogger("info");
const app = createMcpHttpApp({
	"oauth-enabled": true,
	"oauth-environment": oauthEnvironment,
	"server-url": serverURL,
	logger,
});

serve({
	fetch: app.fetch,
	hostname: "0.0.0.0",
	port,
}, ({ address, port }) => {
	logger.info("MCP server started", { host: `${address}:${port}` });
});

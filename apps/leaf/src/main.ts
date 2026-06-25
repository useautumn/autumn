import type { HttpBindings } from "@hono/node-server";
import { serve } from "@hono/node-server";
import { verifyDashboardSession } from "@autumn/auth";
import type { ChatProvider } from "@autumn/shared";
import { type Context, Hono } from "hono";
import { bot, chatAdapterNames } from "./bot.js";
import { decideWebApproval } from "./internal/approvals/surfaces/web/decide.js";
import { listWebApprovals } from "./internal/approvals/surfaces/web/list.js";
import { WEB_CHAT_PROVIDER } from "./internal/installations/actions/ensureWebChatAuth.js";
import { env } from "./lib/env.js";
import { logger } from "./lib/logger.js";
import { createMcpRouter } from "./mcp/mcpRouter.js";
import { slackRoutes } from "./providers/slack/routes.js";

const authDashboard = async (cookie: string | null | undefined) => {
	const session = await verifyDashboardSession({
		cookie,
		authBaseUrl: env.BETTER_AUTH_URL,
	});
	if (!session?.activeOrganizationId) return null;
	return { orgId: session.activeOrganizationId, userId: session.userId };
};

const app = new Hono<{ Bindings: HttpBindings }>();

app.use("*", async (c, next) => {
	// Credentialed (cookie) requests forbid `*` for Allow-Origin/Headers — echo
	// the request's origin + requested headers so the dashboard chat can read the
	// streamed response.
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
		"server-url": env.BETTER_AUTH_URL,
		logger,
		resourceUrl: new URL("/mcp", env.MCP_SERVER_URL).href,
	}),
);

app.route("/slack", slackRoutes);

// Dashboard chat (brokered through the main server). Auth happens in the web
// adapter's getUser via the dashboard's better-auth session.
app.post("/agent/chat", async (c) => {
	if (!bot.webhooks.web) {
		return c.text("Web chat is not configured", 503);
	}
	const response = await bot.webhooks.web(c.req.raw, {
		waitUntil: (task) => {
			task.catch((error) =>
				logger.error("Web chat task failed", {
					event: "leaf.web_chat_task_failed",
					data: { error: String(error) },
				}),
			);
		},
	});
	// The chat SDK returns a raw Response, so the CORS middleware's c.header()
	// doesn't apply — add credential-safe CORS directly for the browser.
	const origin = c.req.header("origin");
	if (!origin) {
		return response;
	}
	const headers = new Headers(response.headers);
	headers.set("Access-Control-Allow-Origin", origin);
	headers.set("Access-Control-Allow-Credentials", "true");
	headers.set("Vary", "Origin");
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
});

// Pending plan-preview / approval interactions for the dashboard chat. The chat
// stream is text-only, so the dashboard fetches these beside the stream.
app.get("/agent/interactions", async (c) => {
	const auth = await authDashboard(c.req.header("cookie"));
	if (!auth) return c.json({ error: "Not authenticated" }, 401);
	const approvals = await listWebApprovals({
		orgId: auth.orgId,
		provider: WEB_CHAT_PROVIDER as ChatProvider,
		workspaceId: auth.orgId,
	});
	return c.json({ approvals });
});

const decideRoute = (action: "approve" | "reject") => async (c: Context) => {
	const auth = await authDashboard(c.req.header("cookie"));
	if (!auth) return c.json({ error: "Not authenticated" }, 401);
	const { approvalId } = await c.req.json<{ approvalId?: string }>();
	if (!approvalId) return c.json({ error: "approvalId required" }, 400);
	const result = await decideWebApproval({
		action,
		approvalId,
		orgId: auth.orgId,
		providerUserId: auth.userId,
	});
	return c.json(result);
};

app.post("/agent/approve", decideRoute("approve"));
app.post("/agent/reject", decideRoute("reject"));

serve(
	{
		fetch: app.fetch,
		hostname: "0.0.0.0",
		port: env.PORT,
	},
	({ address, port }) => {
		logger.info("Chat listening", {
			event: "leaf.server_started",
			data: {
				host: `${address}:${port}`,
				adapters: chatAdapterNames,
			},
		});
	},
);

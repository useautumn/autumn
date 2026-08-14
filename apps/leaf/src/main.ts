import { verifyDashboardSession } from "@autumn/auth";
import type { ChatProvider } from "@autumn/shared";
import type { HttpBindings } from "@hono/node-server";
import { serve } from "@hono/node-server";
import type { UIMessage } from "ai";
import type { Message } from "chat";
import { type Context, Hono } from "hono";
import { bot, chatAdapterNames } from "./bot.js";
import { getEveSession } from "./internal/agentRuntime/eve/repo.js";
import { decideWebApproval } from "./internal/approvals/surfaces/web/decide.js";
import { listWebApprovals } from "./internal/approvals/surfaces/web/list.js";
import { WEB_CHAT_PROVIDER } from "./internal/installations/actions/ensureWebChatAuth.js";
import { db } from "./lib/db.js";
import { env } from "./lib/env.js";
import { logger } from "./lib/logger.js";
import { createMcpRouter } from "./mcp/mcpRouter.js";
import { slackRoutes } from "./providers/slack/routes.js";
import { resolveDashboardEnv } from "./providers/web/dashboardEnv.js";
import { buildEveWebHistory } from "./providers/web/hydrateEveThread.js";
import { buildLegacyClaudeHistory } from "./providers/web/legacyClaudeHistory.js";
import { streamWebChat } from "./providers/web/streamWebChat.js";
import {
	buildWebChatThreadId,
	deleteWebThreads,
	listWebThreads,
	webThreadRef,
} from "./providers/web/webThread.js";

const authDashboard = async (cookie: string | null | undefined) => {
	const session = await verifyDashboardSession({
		cookie,
		authBaseUrl: env.AUTUMN_API_URL,
	});
	if (!session?.activeOrganizationId) return null;
	return {
		orgId: session.activeOrganizationId,
		userId: session.userId,
		scopes: session.scopes,
	};
};

const isValidWebConversationId = (id: string) =>
	id.length > 0 && id.length <= 128 && !id.includes(":");

const messageToUiMessage = (message: Message): UIMessage => ({
	id: message.id,
	role: message.author.isBot === true ? "assistant" : "user",
	parts: [{ type: "text", text: message.text }],
});

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
		"server-url": env.AUTUMN_API_URL,
		logger,
		resourceUrl: new URL("/mcp", env.MCP_SERVER_URL).href,
	}),
);

app.route("/slack", slackRoutes);

app.post("/agent/chat", async (c) => {
	const auth = await authDashboard(c.req.header("cookie"));
	if (!auth) return c.json({ error: "Not authenticated" }, 401);
	return await streamWebChat({
		auth,
		origin: c.req.header("origin"),
		request: c.req.raw,
	});
});

app.get("/agent/chat/threads", async (c) => {
	const auth = await authDashboard(c.req.header("cookie"));
	if (!auth) return c.json({ error: "Not authenticated" }, 401);
	const threads = await listWebThreads({
		db,
		env: resolveDashboardEnv(c.req.header("app_env")),
		orgId: auth.orgId,
		userId: auth.userId,
	});
	return c.json({ threads });
});

app.delete("/agent/chat/threads", async (c) => {
	const auth = await authDashboard(c.req.header("cookie"));
	if (!auth) return c.json({ error: "Not authenticated" }, 401);
	await deleteWebThreads({
		db,
		env: resolveDashboardEnv(c.req.header("app_env")),
		orgId: auth.orgId,
		userId: auth.userId,
	});
	return c.json({ ok: true });
});

app.get("/agent/chat/:threadId/messages", async (c) => {
	const auth = await authDashboard(c.req.header("cookie"));
	if (!auth) return c.json({ error: "Not authenticated" }, 401);
	const conversationId = c.req.param("threadId");
	if (!isValidWebConversationId(conversationId)) {
		return c.json({ error: "Invalid threadId" }, 400);
	}

	const chatThreadId = buildWebChatThreadId({
		conversationId,
		orgId: auth.orgId,
		userId: auth.userId,
	});

	const appEnv = resolveDashboardEnv(c.req.header("app_env"));
	const thread = webThreadRef({ chatThreadId, orgId: auth.orgId });
	const eveSession = await getEveSession({
		db,
		env: appEnv,
		orgId: auth.orgId,
		thread,
	});
	if (eveSession) {
		const messages = await buildEveWebHistory({
			auth: {
				appEnv,
				channelId: thread.channelId,
				orgId: auth.orgId,
				provider: WEB_CHAT_PROVIDER,
				providerUserId: auth.userId,
				threadId: thread.threadId,
				workspaceId: auth.orgId,
			},
			channelId: chatThreadId,
			db,
			env: appEnv,
			orgId: auth.orgId,
			provider: WEB_CHAT_PROVIDER as ChatProvider,
			session: eveSession,
			workspaceId: auth.orgId,
		});
		return c.json({ messages });
	}
	const legacyMessages = await buildLegacyClaudeHistory({
		channelId: chatThreadId,
		db,
		env: appEnv,
		orgId: auth.orgId,
		provider: WEB_CHAT_PROVIDER,
		thread,
		workspaceId: auth.orgId,
	});
	if (legacyMessages) return c.json({ messages: legacyMessages });

	// Keep text-only history readable for threads created before Eve.
	await bot.initialize();
	const chatThread = bot.thread(chatThreadId);
	const messages = [];
	for await (const message of chatThread.messages) {
		if (message.text.trim()) messages.push(messageToUiMessage(message));
	}
	return c.json({ messages: messages.reverse() });
});

// Pending plan-preview / approval interactions for the dashboard chat. The chat
// stream is text-only, so the dashboard fetches these beside the stream.
app.get("/agent/interactions", async (c) => {
	const auth = await authDashboard(c.req.header("cookie"));
	if (!auth) return c.json({ error: "Not authenticated" }, 401);
	// Scope to the current thread so a fresh chat never shows another thread's
	// pending approvals.
	const conversationId = c.req.query("threadId");
	const channelId =
		conversationId && isValidWebConversationId(conversationId)
			? buildWebChatThreadId({
					conversationId,
					orgId: auth.orgId,
					userId: auth.userId,
				})
			: undefined;
	const approvals = await listWebApprovals({
		channelId,
		// Scope to the dashboard's active env (forwarded as app_env) so a sandbox
		// dashboard never surfaces live pending approvals (or vice versa).
		env: resolveDashboardEnv(c.req.header("app_env")),
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

import type { HttpBindings } from "@hono/node-server";
import { type Context, Hono } from "hono";
import { db } from "../../lib/db.js";
import { decideWebApproval } from "./actions/decideWebApproval.js";
import { getWebChatMessages } from "./actions/getWebChatMessages.js";
import { listWebApprovals } from "./actions/listWebApprovals.js";
import { authDashboard } from "./authDashboard.js";
import { resolveDashboardEnv } from "./dashboardEnv.js";
import { streamWebChat } from "./streamWebChat.js";
import {
	buildWebChatThreadId,
	deleteWebThreads,
	listWebThreads,
} from "./webThread.js";

type WebRoutesEnv = { Bindings: HttpBindings };
const MAX_WEB_CONVERSATION_ID_LENGTH = 128;

const authenticate = async (c: Context<WebRoutesEnv>) => {
	const auth = await authDashboard({ cookie: c.req.header("cookie") });
	return auth
		? ({ auth } as const)
		: ({ response: c.json({ error: "Not authenticated" }, 401) } as const);
};

const isValidWebConversationId = (id: string) =>
	id.length > 0 &&
	id.length <= MAX_WEB_CONVERSATION_ID_LENGTH &&
	!id.includes(":");

export const webRoutes = new Hono<WebRoutesEnv>();

webRoutes.post("/chat", async (c) => {
	const authenticated = await authenticate(c);
	if ("response" in authenticated) return authenticated.response;
	return streamWebChat({
		auth: authenticated.auth,
		origin: c.req.header("origin"),
		request: c.req.raw,
	});
});

webRoutes.get("/chat/threads", async (c) => {
	const authenticated = await authenticate(c);
	if ("response" in authenticated) return authenticated.response;
	const { orgId, userId } = authenticated.auth;
	const threads = await listWebThreads({
		db,
		env: resolveDashboardEnv(c.req.header("app_env")),
		orgId,
		userId,
	});
	return c.json({ threads });
});

webRoutes.delete("/chat/threads", async (c) => {
	const authenticated = await authenticate(c);
	if ("response" in authenticated) return authenticated.response;
	const { orgId, userId } = authenticated.auth;
	await deleteWebThreads({
		db,
		env: resolveDashboardEnv(c.req.header("app_env")),
		orgId,
		userId,
	});
	return c.json({ ok: true });
});

webRoutes.get("/chat/:threadId/messages", async (c) => {
	const authenticated = await authenticate(c);
	if ("response" in authenticated) return authenticated.response;
	const conversationId = c.req.param("threadId");
	if (!isValidWebConversationId(conversationId)) {
		return c.json({ error: "Invalid threadId" }, 400);
	}
	const messages = await getWebChatMessages({
		conversationId,
		env: resolveDashboardEnv(c.req.header("app_env")),
		orgId: authenticated.auth.orgId,
		userId: authenticated.auth.userId,
	});
	return c.json({ messages });
});

webRoutes.get("/interactions", async (c) => {
	const authenticated = await authenticate(c);
	if ("response" in authenticated) return authenticated.response;
	const { orgId, userId } = authenticated.auth;
	const conversationId = c.req.query("threadId");
	const channelId =
		conversationId && isValidWebConversationId(conversationId)
			? buildWebChatThreadId({ conversationId, orgId, userId })
			: undefined;
	const approvals = await listWebApprovals({
		channelId,
		env: resolveDashboardEnv(c.req.header("app_env")),
		orgId,
		provider: "web",
		workspaceId: orgId,
	});
	return c.json({ approvals });
});

const decideRoute =
	(action: "approve" | "reject") => async (c: Context<WebRoutesEnv>) => {
		const authenticated = await authenticate(c);
		if ("response" in authenticated) return authenticated.response;
		const { approvalId } = await c.req.json<{ approvalId?: string }>();
		if (!approvalId) return c.json({ error: "approvalId required" }, 400);
		const result = await decideWebApproval({
			action,
			approvalId,
			orgId: authenticated.auth.orgId,
			providerUserId: authenticated.auth.userId,
		});
		return c.json(result);
	};

webRoutes.post("/approve", decideRoute("approve"));
webRoutes.post("/reject", decideRoute("reject"));

import { type Context, Hono } from "hono";
import type { HonoEnv } from "../honoUtils/HonoEnv.js";

const bodylessMethods = new Set(["GET", "HEAD"]);

const proxyChatRequest =
	(chatServerUrl: string) => async (c: Context<HonoEnv>) => {
		const url = new URL(c.req.url);
		const headers = new Headers(c.req.raw.headers);
		headers.delete("host");

		return fetch(`${chatServerUrl}${url.pathname}${url.search}`, {
			body: bodylessMethods.has(c.req.raw.method) ? undefined : c.req.raw.body,
			headers,
			method: c.req.raw.method,
			redirect: "manual",
		} as RequestInit & { duplex: "half" });
	};

export const createChatProxyRouter = (
	chatServerUrl = process.env.CHAT_SERVER_URL ??
		(process.env.NODE_ENV === "production"
			? "https://chat.useautumn.com"
			: "http://localhost:3099"),
) => {
	const router = new Hono<HonoEnv>();
	const proxy = proxyChatRequest(chatServerUrl);

	router.get("/slack/oauth/callback", proxy);
	router.post("/slack/events", proxy);
	router.post("/slack/interactions", proxy);

	// Dashboard chat → Leaf. Pass-through (cookies forwarded); Leaf's web adapter
	// authenticates the dashboard session in getUser.
	router.post("/agent/chat", proxy);

	// Proxy the MCP endpoint to leaf so a public origin (e.g. NGROK_URL) reaches it —
	// Claude Managed Agents run in Anthropic's cloud and cannot hit leaf's localhost.
	// Point MCP_SERVER_URL at this public origin so the agent + vault use it.
	router.get("/.well-known/oauth-protected-resource/mcp", proxy);
	router.all("/mcp", proxy);

	return router;
};

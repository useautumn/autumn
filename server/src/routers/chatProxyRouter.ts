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

	return router;
};

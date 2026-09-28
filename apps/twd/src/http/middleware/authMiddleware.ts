import type { MiddlewareHandler } from "hono";
import { authenticateRequest } from "../../internal/auth/actions/authenticateRequest.ts";
import { createContext, SYSTEM_ACTOR } from "../../lib/createContext.ts";
import { TwdError } from "../apiError.ts";
import type { TwdHono } from "../types/twdHono.ts";

const PUBLIC_PREFIXES = ["/auth/", "/webhooks/", "/ingress/"];

export const isPublicPath = ({ path }: { path: string }) =>
	path === "/health" ||
	PUBLIC_PREFIXES.some((prefix) => path.startsWith(prefix));

/** Browsers can't set headers on a WebSocket, so /ws also accepts `?token=twd_…`. */
const withQueryToken = ({ request }: { request: Request }): Request => {
	const url = new URL(request.url);
	const token = url.searchParams.get("token");
	if (url.pathname !== "/ws" || !token || request.headers.has("authorization"))
		return request;
	const headers = new Headers(request.headers);
	headers.set("authorization", `Bearer ${token}`);
	return new Request(request, { headers });
};

/** Sets `ctx` on every request; non-public routes need a session cookie or API key. */
export const authMiddleware: MiddlewareHandler<TwdHono> = async (c, next) => {
	if (isPublicPath({ path: c.req.path })) {
		c.set("ctx", createContext({ actor: SYSTEM_ACTOR }));
		return next();
	}
	const actor = await authenticateRequest({
		request: withQueryToken({ request: c.req.raw }),
	});
	if (!actor) {
		const { env } = createContext();
		throw new TwdError({
			status: 401,
			code: "unauthenticated",
			message: "No valid session cookie or API key on this request.",
			next: `sign in at ${env.TWD_PUBLIC_URL}/auth/google or pass Authorization: Bearer twd_…`,
			escalate: "ask a teammate for dashboard access / an API key",
		});
	}
	c.set("ctx", createContext({ actor }));
	return next();
};

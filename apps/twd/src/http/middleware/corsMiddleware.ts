import type { MiddlewareHandler } from "hono";
import { cors } from "hono/cors";
import { getWebOrigins } from "../../internal/auth/actions/safeRedirect.ts";
import type { TwdHono } from "../types/twdHono.ts";

export const corsMiddleware = (): MiddlewareHandler<TwdHono> => {
	const origins = getWebOrigins();
	return cors({
		origin: (origin) => (origins.includes(origin) ? origin : null),
		credentials: true,
		allowHeaders: ["Authorization", "Content-Type"],
		allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
	});
};

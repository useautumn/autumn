import type { MiddlewareHandler } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";

type ExpandCarrier = {
	expand?: string | string[];
	skip_cache?: boolean | string;
};

/**
 * Extracts expand from query params and request body, sets it in context.
 * Runs before validator, so accesses raw query and cloned body directly.
 */
export const expandMiddleware = (): MiddlewareHandler<HonoEnv> => {
	return async (c, next) => {
		const rawQuery = c.req.query();

		// Try to parse body for POST/PUT/PATCH requests
		let body: ExpandCarrier | undefined;
		if (["POST", "PUT", "PATCH"].includes(c.req.method)) {
			try {
				body = await c.req.json();
				// Re-set the body so downstream handlers can read it
				// Hono caches the parsed body, so this should work
			} catch {
				body = undefined;
			}
		}

		// Precedence: body expand > query expand
		const expandValue = body?.expand ?? rawQuery?.expand;
		const skipCacheQuery = body?.skip_cache ?? rawQuery?.skip_cache;

		const skipCacheValue =
			(typeof skipCacheQuery === "boolean" && skipCacheQuery === true) ||
			(typeof skipCacheQuery === "string" && skipCacheQuery === "true");

		// Normalize to array: undefined -> [], string -> [string], array -> array
		const expand: string[] = !expandValue
			? []
			: Array.isArray(expandValue)
				? expandValue
				: [expandValue];

		const ctx = c.get("ctx");
		c.set("ctx", {
			...ctx,
			expand,
			skipCache: skipCacheValue,
		});

		await next();
	};
};

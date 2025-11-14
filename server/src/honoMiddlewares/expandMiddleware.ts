import type { MiddlewareHandler } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";

/**
 * Extracts expand from validated query and sets it in context.
 * Must run AFTER versionedValidator so expand has been transformed.
 * Uses c.req.valid("query") to access the transformed/validated expand field.
 */
export const expandMiddleware = (): MiddlewareHandler<HonoEnv> => {
	return async (c, next) => {
		// Get validated query (which includes transformed values from version changes)
		// Fallback to raw query if validation hasn't happened yet
		const validatedQuery = (c.req as any).valid?.("query") as
			| { expand?: string | string[]; skip_cache?: boolean }
			| undefined;
		const rawQuery = c.req.query();

		// Prefer validated query (transformed), fallback to raw query
		const expandValue = validatedQuery?.expand ?? rawQuery?.expand;
		const skipCacheQuery = validatedQuery?.skip_cache ?? rawQuery?.skip_cache;

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

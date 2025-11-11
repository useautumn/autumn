import type { MiddlewareHandler } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";

/**
 * Extracts expand from validated query and sets it in context.
 * Must run AFTER versionedValidator so expand has been transformed.
 * Uses c.req.query("expand") to access the parsed expand field.
 */
export const expandMiddleware = (): MiddlewareHandler<HonoEnv> => {
	return async (c, next) => {
		// Query is parsed by queryMiddleware and validated by versionedValidator/validator
		// queryStringArray normalizes expand to an array during validation, but we access
		// the parsed query which may still be a string for single values
		const expandValue = c.req.query("expand");
		// queryMiddleware converts "true"/"false" strings to boolean values
		// Handle both boolean (from queryMiddleware) and string (fallback) cases
		const skipCacheQuery = c.req.query("skip_cache");
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

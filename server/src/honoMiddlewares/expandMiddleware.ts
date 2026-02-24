import type { MiddlewareHandler } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";

type ExpandCarrier = {
	expand?: string | string[];
	skip_cache?: boolean | string;
};

interface RequestWithValidation {
	valid(target: "query"): ExpandCarrier | undefined;
	valid(target: "json"): ExpandCarrier | undefined;
}

/**
 * Extracts expand from validated query/body data and sets it in context.
 * Runs AFTER versionedValidator so it reads transformed data.
 */
export const expandMiddleware = (): MiddlewareHandler<HonoEnv> => {
	return async (c, next) => {
		const req = c.req as typeof c.req & RequestWithValidation;

		// Read from validated data (after version transformations applied)
		// Fall back to raw query if no validated data exists
		let validatedQuery: ExpandCarrier | undefined;
		try {
			validatedQuery = req.valid("query");
		} catch {
			// No validated query data - use raw query
			validatedQuery = c.req.query() as ExpandCarrier | undefined;
		}

		// Try to get validated body for POST/PUT/PATCH requests
		let validatedBody: ExpandCarrier | undefined;
		if (["POST", "PUT", "PATCH"].includes(c.req.method)) {
			try {
				validatedBody = req.valid("json");
			} catch {
				// No validated body - try raw body
				try {
					validatedBody = await c.req.json();
				} catch {
					validatedBody = undefined;
				}
			}
		}

		// Precedence: body expand > query expand
		const expandValue = validatedBody?.expand ?? validatedQuery?.expand;
		const skipCacheQuery =
			validatedBody?.skip_cache ?? validatedQuery?.skip_cache;

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

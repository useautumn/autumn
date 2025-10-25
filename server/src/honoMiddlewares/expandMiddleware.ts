import type { MiddlewareHandler } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";

/**
 * Extracts expand from validated query and sets it in context.
 * Must run AFTER versionedValidator so expand has been transformed.
 */
export const expandMiddleware = (): MiddlewareHandler<HonoEnv> => {
	return async (c, next) => {
		const validatedQuery = c.req.valid("query");
		const expand = validatedQuery?.expand || [];

		const ctx = c.get("ctx");
		c.set("ctx", {
			...ctx,
			expand: Array.isArray(expand) ? expand : [expand],
		});

		await next();
	};
};

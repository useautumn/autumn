import type { Context, Next } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { invalidateProductsCache } from "@/internal/products/productCacheUtils.js";
import { matchRoute } from "./middlewareUtils.js";

/**
 * Route patterns that trigger products cache invalidation.
 * These are the simple CRUD routes - complex cases (copy across envs, conditional invalidation)
 * are handled explicitly in their respective handlers.
 */
const productRoutes = [
	{ method: "POST", url: "/products" },
	{ method: "POST", url: "/products/:product_id" },
	{ method: "PATCH", url: "/products/:product_id" },
	{ method: "DELETE", url: "/products/:product_id" },
];

/**
 * Hono middleware that clears products cache after successful responses
 * for specific routes. Only handles simple cases where orgId/env come from ctx.
 *
 * Edge cases handled explicitly in handlers:
 * - handleCopyProductV2: invalidates source + target envs
 * - handleCopyEnvironment: invalidates live env specifically
 * - handleSyncPreviewPricing: different org context (preview org)
 * - handlePushOrganisationConfiguration: conditional (only if products created)
 * - handleNukeOrganisationConfiguration: internal route
 */
export const refreshProductsCacheMiddleware = async (
	c: Context<HonoEnv>,
	next: Next,
) => {
	await next();

	if (c.res.status < 200 || c.res.status >= 300) return;

	const ctx = c.get("ctx");

	if (ctx.testOptions?.skipCacheDeletion) return;

	const pathname = new URL(c.req.url).pathname.replace("/v1", "");
	const method = c.req.method;

	const match = productRoutes.find((pattern) =>
		matchRoute({ url: pathname, method, pattern }),
	);

	if (!match) return;

	await invalidateProductsCache({
		orgId: ctx.org.id,
		env: ctx.env,
	});
};

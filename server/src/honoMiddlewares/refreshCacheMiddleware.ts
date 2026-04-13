import type { Context, Next } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer.js";
import { getRefreshCacheRouteConfig } from "./refreshCacheConfigs.js";

/**
 * Hono middleware that clears customer cache after successful responses
 * for specific routes
 */
export const refreshCacheMiddleware = async (
	c: Context<HonoEnv>,
	next: Next,
) => {
	// Continue with the request
	await next();

	// Only clear cache on successful responses (2xx status codes)
	if (c.res.status < 200 || c.res.status >= 300) return;

	const ctx = c.get("ctx");

	if (ctx.testOptions?.skipCacheDeletion) return;

	const pathname = new URL(c.req.url).pathname.replace("/v1", "");
	const method = c.req.method;
	const routeConfig = getRefreshCacheRouteConfig({
		method,
		path: pathname,
	});

	if (!routeConfig || !ctx.customerId) return;

	await deleteCachedFullCustomer({
		customerId: ctx.customerId,
		entityId: ctx.entityId,
		ctx,
		source: "refreshCacheMiddleware",
	});
};

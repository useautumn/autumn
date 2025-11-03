import type { Context, Next } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { deleteCusCache } from "@/internal/customers/cusCache/updateCachedCus.js";
import { matchRoute } from "./middlewareUtils.js";

/**
 * Route patterns that trigger customer cache deletion
 */
const cusPrefixedUrls = [
	{
		method: "POST",
		url: "/customers/:customer_id",
	},
	{
		method: "DELETE",
		url: "/customers/:customer_id",
	},
	{
		method: "POST",
		url: "/customers/:customer_id/balances",
	},
	{
		method: "POST",
		url: "/customers/:customer_id/entitlements/:customer_entitlement_id",
	},
	{
		method: "POST",
		url: "/customers/:customer_id/entities",
	},
	{
		method: "DELETE",
		url: "/customers/:customer_id/entities/:entity_id",
	},
	{
		method: "POST",
		url: "/customers/:customer_id/transfer_product",
	},
];

/**
 * Core routes that trigger cache deletion when customer_id is in body
 */
const coreUrls = [
	{
		method: "POST",
		url: "/attach",
	},
	{
		method: "POST",
		url: "/cancel",
	},
	{
		method: "POST",
		url: "/balances/update",
	},
];

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
	if (c.res.status < 200 || c.res.status >= 300) {
		return;
	}

	const ctx = c.get("ctx");
	const { logger, db, org, env } = ctx;

	const pathname = new URL(c.req.url).pathname.replace("/v1", "");
	const method = c.req.method;

	// Check if URL matches customer-prefixed patterns
	const pathMatch = cusPrefixedUrls.find((pattern) =>
		matchRoute({ url: pathname, method, pattern }),
	);

	if (pathMatch) {
		const customerId = c.req.param("customer_id");
		if (customerId) {
			logger.info(
				`Clearing cache for customer ${customerId}, url: ${pathname}`,
			);
			await deleteCusCache({
				db,
				customerId,
				org,
				env,
			});
		}
		return;
	}

	// Check if URL matches core patterns (attach, cancel)
	const coreMatch = coreUrls.find((pattern) =>
		matchRoute({ url: pathname, method, pattern }),
	);

	if (coreMatch) {
		// For core URLs, check body for customer_id
		const body = await c.req.json().catch(() => null);
		if (body?.customer_id) {
			logger.info(`Clearing cache for core url ${pathname}`);
			await deleteCusCache({
				db,
				customerId: body.customer_id,
				org,
				env,
			});
		}
	}
};

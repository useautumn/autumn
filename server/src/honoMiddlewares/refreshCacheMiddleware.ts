import type { Context, Next } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer.js";
import { matchRoute } from "./middlewareUtils.js";

/**
 * Route patterns that trigger customer cache deletion
 */
const cusPrefixedUrls = [
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
		url: "/customers/:customer_id/transfer",
	},
];

/**
 * Core routes that trigger cache deletion when customer_id is in body
 * Note: /balances/update is NOT included because it updates Redis directly
 * to avoid race conditions with batched track syncs
 */
const coreUrls: { method: string; url: string; source?: string }[] = [
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
		url: "/subscriptions/update",
	},
	{
		method: "POST",
		url: "/billing/attach",
	},

	{
		method: "POST",
		url: "/balances/create",
		source: "handleCreateBalance",
	},

	// BILLING ROUTES
	{
		method: "POST",
		url: "/billing.attach",
		source: "attach",
	},
	{
		method: "POST",
		url: "/billing.update",
		source: "updateSubscription",
	},
	{
		method: "POST",
		url: "/billing.setup_payment",
		source: "setupPayment",
	},
	{
		method: "POST",
		url: "/billing.multi_attach",
		source: "multiAttach",
	},

	// BALANCES
	{
		method: "POST",
		url: "/balances.create",
		source: "createBalance",
	},
	{
		method: "POST",
		url: "/balances.delete",
		source: "createBalance",
	},

	// ENTITIES
	{
		method: "POST",
		url: "/entities.create",
		source: "createEntity",
	},
	{
		method: "POST",
		url: "/entities.delete",
		source: "deleteEntity",
	},

	// CUSTOMERS
	{
		method: "POST",
		url: "/customers.delete",
		source: "deleteCustomer",
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
	if (c.res.status < 200 || c.res.status >= 300) return;

	const ctx = c.get("ctx");

	if (ctx.testOptions?.skipCacheDeletion) return;

	const pathname = new URL(c.req.url).pathname.replace("/v1", "");
	const method = c.req.method;

	// Check if URL matches customer-prefixed patterns
	const pathMatch = cusPrefixedUrls.find((pattern) =>
		matchRoute({ url: pathname, method, pattern }),
	);

	if (pathMatch) {
		const customerId = c.req.param("customer_id");
		if (customerId) {
			await deleteCachedFullCustomer({
				customerId,
				ctx,
				source: "refreshCacheMiddleware",
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
			await deleteCachedFullCustomer({
				customerId: body.customer_id,
				ctx,
				source: "refreshCacheMiddleware",
			});
		}
	}
};

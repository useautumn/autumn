import type { Context, Next } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { warmFullSubjectCache } from "@/internal/customers/cache/fullSubject/actions/warmFullSubjectCache.js";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer.js";
import { getRefreshCacheRouteConfig } from "./refreshCacheConfigs.js";

export const refreshCacheMiddleware = async (
	c: Context<HonoEnv>,
	next: Next,
) => {
	await next();

	if (c.res.status < 200 || c.res.status >= 300) return;

	const ctx = c.get("ctx");

	if (ctx.skipSubjectCacheDeletion) return;
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
		flushBalances: routeConfig.flushBalances,
	});

	warmFullSubjectCache({
		ctx,
		customerId: ctx.customerId,
		source: "refreshCacheMiddleware",
	});
};

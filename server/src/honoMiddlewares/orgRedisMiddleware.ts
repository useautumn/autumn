import type { Context, Next } from "hono";
import { resolveRedisForCustomer } from "@/external/redis/customerRedisRouting.js";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";

/** Resolves the correct Redis instance for this request based on org + customer routing.
 *  Must run after secretKeyMiddleware (ctx.org populated) and baseMiddleware (ctx.customerId set).
 *  Uses percentage-based bucket routing for orgs with redis_config during migration.
 */
export const orgRedisMiddleware = async (
	c: Context<HonoEnv>,
	next: Next,
): Promise<void> => {
	const ctx = c.get("ctx");
	ctx.redis = resolveRedisForCustomer({
		org: ctx.org,
		customerId: ctx.customerId,
	});
	await next();
};

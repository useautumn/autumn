import type { Context, Next } from "hono";
import { getCtxWithCustomerRedis } from "@/external/redis/customerRedisRouting.js";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { CusService } from "@/internal/customers/CusService.js";
import { computeRolloutSnapshot } from "@/internal/misc/rollouts/rolloutUtils.js";

/** TTL for vercel installation ID -> customer ID cache (1 day) */
export const VERCEL_INSTALLATION_CACHE_TTL_SECONDS = 24 * 60 * 60;

export const buildVercelInstallationCacheKey = ({
	orgId,
	env,
	vercelInstallationId,
}: {
	orgId: string;
	env: string;
	vercelInstallationId: string;
}) => {
	return `{${orgId}}:${env}:vercel_install:${vercelInstallationId}`;
};

/**
 * Fetches the Autumn customer by Vercel installation ID and sets `ctx.fullCustomer`.
 * Tolerant of null — customer may not exist yet (e.g. during `PUT` upsert).
 */
export const vercelCustomerMiddleware = async (
	c: Context<HonoEnv>,
	next: Next,
) => {
	const ctx = c.get("ctx");
	const { integrationConfigurationId } = c.req.param();

	const customer = await CusService.getByVercelId({
		ctx,
		vercelInstallationId: integrationConfigurationId,
	});

	const customerId = customer?.id || customer?.internal_id || undefined;
	if (customerId) {
		const { ctx: routedCtx } = getCtxWithCustomerRedis({
			ctx: {
				...ctx,
				fullCustomer: customer ?? undefined,
				customerId,
				rolloutSnapshot: computeRolloutSnapshot({
					orgId: ctx.org.id,
					customerId,
				}),
			},
			customerId,
		});
		c.set("ctx", routedCtx);
	} else {
		c.set("ctx", {
			...ctx,
			fullCustomer: customer ?? undefined,
		});
	}

	await next();
};

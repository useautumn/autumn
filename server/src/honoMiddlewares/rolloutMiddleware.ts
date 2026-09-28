import type { Context, Next } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { computeRolloutSnapshot } from "@/internal/misc/rollouts/rolloutUtils.js";

/**
 * Computes the rollout snapshot once per request and stores it on ctx.
 * Must run after auth (ctx.org available) and baseMiddleware (ctx.customerId set).
 * Downstream code reads ctx.rolloutSnapshot instead of the global store,
 * guaranteeing consistent decisions for the entire request lifetime.
 */
export const rolloutMiddleware = async (
	c: Context<HonoEnv>,
	next: Next,
): Promise<void> => {
	const ctx = c.get("ctx");
	ctx.rolloutSnapshot = computeRolloutSnapshot({
		orgId: ctx.org?.id,
		customerId: ctx.customerId,
	});
	await next();
};

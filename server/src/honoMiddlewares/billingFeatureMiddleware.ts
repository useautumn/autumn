import type { BillingFeatureId } from "@autumn/billing";
import { ErrCode, RecaseError } from "@autumn/shared";
import type { MiddlewareHandler } from "hono";
import { featureAccess } from "@/external/autumn/featureAccess.js";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";

/** Refuses the route unless the org's plan on Autumn's own billing includes the feature. */
export const billingFeatureMiddleware =
	({
		featureId,
		featureName,
	}: {
		featureId: BillingFeatureId;
		featureName: string;
	}): MiddlewareHandler<HonoEnv> =>
	async (c, next) => {
		const ctx = c.get("ctx");
		const allowed = await featureAccess({ ctx }).hasFeature({
			orgId: ctx.org.id,
			featureId,
		});
		if (!allowed)
			throw new RecaseError({
				message: `${featureName} isn't included in your plan. Contact hey@useautumn.com to enable it.`,
				code: ErrCode.FeatureLimitReached,
				statusCode: 403,
			});
		await next();
	};

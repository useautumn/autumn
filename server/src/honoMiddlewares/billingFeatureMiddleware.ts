import { type BillingFeatureId, orgHasFeature } from "@autumn/billing";
import { ErrCode, RecaseError } from "@autumn/shared";
import type { MiddlewareHandler } from "hono";
import { getBillingAutumnClient } from "@/external/autumn/getBillingAutumnClient.js";
import type { AutumnContext, HonoEnv } from "@/honoUtils/HonoEnv.js";

/** Times each check on Autumn's own billing and logs whether it went edge-first or to the API. */
const checkOrgHasFeature = async ({
	ctx,
	featureId,
}: {
	ctx: AutumnContext;
	featureId: BillingFeatureId;
}): Promise<boolean> => {
	const { autumn, path } = getBillingAutumnClient();
	const startedAt = performance.now();
	const allowed = await orgHasFeature({
		ctx: { autumn, logger: ctx.logger },
		orgId: ctx.org.id,
		featureId,
	});
	ctx.logger.info("billing_check", {
		type: "billing_check",
		data: {
			path,
			featureId,
			allowed,
			durationMs: Math.round(performance.now() - startedAt),
		},
	});
	return allowed;
};

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
		const override = ctx.testOptions?.billingFeatures?.[featureId];
		// Stacks without Autumn's own key (local, dev) have nothing to check against.
		const allowed =
			override ??
			(!process.env.AUTUMN_SECRET_KEY ||
				(await checkOrgHasFeature({ ctx, featureId })));

		if (!allowed)
			throw new RecaseError({
				message: `${featureName} isn't included in your plan. Contact hey@useautumn.com to enable it.`,
				code: ErrCode.FeatureLimitReached,
				statusCode: 403,
			});
		await next();
	};

import { type BillingFeatureId, orgHasFeature } from "@autumn/billing";
import { getAutumnEnv } from "@autumn/env";
import { ErrCode, RecaseError } from "@autumn/shared";
import type { MiddlewareHandler } from "hono";
import { getBillingAutumnClient } from "@/external/autumn/getBillingAutumnClient.js";
import { onAwsEcs } from "@/external/aws/ecs/onAwsEcs.js";
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
		const override = ctx.testOptions?.billingFeatures?.[featureId];
		// The local dev server, and stacks without Autumn's own key, skip the plan check; deployed images run NODE_ENV=production.
		const allowed =
			override ??
			(process.env.NODE_ENV === "development" ||
				!process.env.AUTUMN_SECRET_KEY ||
				(await orgHasFeature({
					ctx: { autumn: getBillingAutumnClient(), logger: ctx.logger },
					orgId: ctx.org.id,
					featureId,
					// Autumn's own Atom is private to prod's VPC, so only ECS tasks reach it.
					useEdge: onAwsEcs() && Boolean(getAutumnEnv().AUTUMN_EDGE_URL),
				})));

		if (!allowed)
			throw new RecaseError({
				message: `${featureName} isn't included in your plan. Contact hey@useautumn.com to enable it.`,
				code: ErrCode.FeatureLimitReached,
				statusCode: 403,
			});
		await next();
	};

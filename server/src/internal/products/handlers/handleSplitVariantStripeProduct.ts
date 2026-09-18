import { Scopes, SplitVariantStripeProductParamsSchema } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { getPlanResponse } from "../productUtils/productResponseUtils/getPlanResponse.js";
import { splitVariantStripeProduct } from "../stripeResourceUtils/splitVariantStripeProduct.js";

export const handleSplitVariantStripeProduct = createRoute({
	scopes: [Scopes.Plans.Write],
	body: SplitVariantStripeProductParamsSchema,
	handler: async (c) => {
		const { variant_plan_id } = c.req.valid("json");
		const ctx = c.get("ctx");

		const variant = await splitVariantStripeProduct({
			ctx,
			variantPlanId: variant_plan_id,
		});

		return c.json(
			await getPlanResponse({ ctx, product: variant, features: ctx.features }),
		);
	},
});

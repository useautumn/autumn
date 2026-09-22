import { CreatePlanInStripeParamsSchema, Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { rewardMutationLock } from "@/internal/rewards/rewardLock.js";
import { getPlanResponse } from "../productUtils/productResponseUtils/getPlanResponse.js";
import { createPlanInStripe } from "../stripeResourceUtils/createPlanInStripe.js";

export const handleCreatePlanInStripe = createRoute({
	scopes: [Scopes.Plans.Write],
	body: CreatePlanInStripeParamsSchema,
	lock: rewardMutationLock,
	handler: async (c) => {
		const { plan_id } = c.req.valid("json");
		const ctx = c.get("ctx");

		const plan = await createPlanInStripe({ ctx, planId: plan_id });

		return c.json(
			await getPlanResponse({ ctx, product: plan, features: ctx.features }),
		);
	},
});

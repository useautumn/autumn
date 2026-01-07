import { UpdateSubscriptionV0ParamsSchema } from "@autumn/shared";
import { computeUpdateSubscriptionPlan } from "@/internal/billing/v2/updateSubscription/compute/computeUpdateSubscriptionPlan";
import { createRoute } from "../../../../honoMiddlewares/routeHandler";
import { executeBillingPlan } from "../execute/executeBillingPlan";
import { evaluateStripeBillingPlan } from "../providers/stripe/actionBuilders/evaluateStripeBillingPlan";
import { fetchUpdateSubscriptionBillingContext } from "../updateSubscription/fetch/fetchUpdateSubscriptionBillingContext";

export const handleUpdateSubscription = createRoute({
	body: UpdateSubscriptionV0ParamsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const body = c.req.valid("json");

		const billingContext = await fetchUpdateSubscriptionBillingContext({
			ctx,
			params: body,
		});

		const autumnBillingPlan = await computeUpdateSubscriptionPlan({
			ctx,
			billingContext,
			params: body,
		});

		const stripeBillingPlan = evaluateStripeBillingPlan({
			ctx,
			billingContext,
			autumnBillingPlan,
		});

		await executeBillingPlan({
			ctx,
			billingContext,
			billingPlan: {
				autumn: autumnBillingPlan,
				stripe: stripeBillingPlan,
			},
		});

		return c.json({ success: true }, 200);
	},
});

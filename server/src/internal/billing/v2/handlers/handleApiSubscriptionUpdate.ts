import { SubscriptionUpdateV0ParamsSchema } from "@autumn/shared";
import { createRoute } from "../../../../honoMiddlewares/routeHandler";
import { executeBillingPlan } from "../execute/executeBillingPlan";
import { computeSubscriptionUpdatePlan } from "../subscriptionUpdate/compute/computeSubscriptionUpdatePlan";
import { evaluateSubscriptionUpdatePlan } from "../subscriptionUpdate/evaluate/evaluateSubscriptionUpdatePlan";
import { fetchApiSubscriptionUpdateContext } from "../subscriptionUpdate/fetch/fetchApiSubscriptionUpdateContext";

export const handleApiSubscriptionUpdate = createRoute({
	body: SubscriptionUpdateV0ParamsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const body = c.req.valid("json");

		const updateSubscriptionContext = await fetchApiSubscriptionUpdateContext({
			ctx,
			params: body,
		});

		const autumnBillingPlan = await computeSubscriptionUpdatePlan({
			ctx,
			updateSubscriptionContext,
			params: body,
		});

		const stripeBillingPlan = evaluateSubscriptionUpdatePlan({
			ctx,
			updateSubscriptionContext,
			params: body,
			autumnBillingPlan,
		});

		await executeBillingPlan({
			ctx,
			billingContext: updateSubscriptionContext,
			billingPlan: {
				autumn: autumnBillingPlan,
				stripe: stripeBillingPlan,
			},
		});

		return c.json({ success: true }, 200);
	},
});

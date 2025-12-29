import { SubscriptionUpdateV0ParamsSchema } from "@autumn/shared";
import { createRoute } from "../../../../honoMiddlewares/routeHandler";
import { executeBillingPlan } from "../execute/executeBillingPlan";
import { computeSubscriptionUpdatePlan } from "../subscriptionUpdate/compute/computeSubscriptionUpdatePlan";
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

		const billingPlan = await computeSubscriptionUpdatePlan({
			ctx,
			updateSubscriptionContext,
			params: body,
		});

		await executeBillingPlan({
			ctx,
			billingContext: updateSubscriptionContext,
			billingPlan,
		});

		return c.json({ success: true }, 200);
	},
});

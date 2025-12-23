import { SubscriptionUpdateV0ParamsSchema } from "@autumn/shared";
import { executeBillingPlan } from "@/internal/billing/v2/execute/executeBillingPlan";
import { createRoute } from "../../../../honoMiddlewares/routeHandler";
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

		const subscriptionUpdatePlan = await computeSubscriptionUpdatePlan({
			ctx,
			updateSubscriptionContext,
			params: body,
		});

		await executeBillingPlan({
			ctx,
			billingContext: updateSubscriptionContext,
			billingPlan: subscriptionUpdatePlan,
		});

		return c.json({ success: true }, 200);
	},
});

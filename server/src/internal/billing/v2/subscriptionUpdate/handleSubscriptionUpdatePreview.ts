import { SubscriptionUpdateV0ParamsSchema } from "@autumn/shared";
import { createRoute } from "../../../../honoMiddlewares/routeHandler";
import { computeSubscriptionUpdatePlan } from "../subscriptionUpdate/compute/computeSubscriptionUpdatePlan";
import { fetchApiSubscriptionUpdateContext } from "../subscriptionUpdate/fetch/fetchApiSubscriptionUpdateContext";

export const handleSubscriptionUpdatePreview = createRoute({
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

		return c.json(subscriptionUpdatePlan, 200);
	},
});

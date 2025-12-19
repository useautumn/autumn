import { SubscriptionUpdateV0ParamsSchema } from "@autumn/shared";
import { createRoute } from "../../../../honoMiddlewares/routeHandler";
import { computeSubscriptionUpdatePlan } from "../subscriptionUpdate/compute/computeSubscriptionUpdatePlan";
import { executeSubscriptionUpdate } from "../subscriptionUpdate/execute/executeSubscriptionUpdate";
import { fetchApiSubscriptionUpdateContext } from "../subscriptionUpdate/fetch/fetchApiSubscriptionUpdateContext";

export const handleApiSubscriptionUpdate = createRoute({
	body: SubscriptionUpdateV0ParamsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const body = c.req.valid("json");

		const updateSubscriptionContext = await fetchApiSubscriptionUpdateContext(
			ctx,
			body,
		);

		const subscriptionUpdatePlan = computeSubscriptionUpdatePlan(ctx, {
			updateSubscriptionContext,
			params: body,
		});

		await executeSubscriptionUpdate(ctx, {
			params: body,
			updateSubscriptionContext,
			subscriptionUpdatePlan,
		});

		return c.json({ success: true }, 200);
	},
});

// versionedBody: {
// 	latest: ApiSubscriptionUpdateBodyV1Schema,
// 	[ApiVersion.V2_0]: ApiSubscriptionUpdateBodyV0Schema,
// },
// resource: AffectedResource.ApiSubscriptionUpdate,
// handler: async (c) => {
// 	const ctx = c.get("ctx");
// 	const body = c.req.valid("json");
// },

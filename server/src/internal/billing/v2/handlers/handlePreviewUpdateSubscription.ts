import {
	AffectedResource,
	ApiVersion,
	UpdateSubscriptionV0ParamsSchema,
	UpdateSubscriptionV1ParamsSchema,
} from "@autumn/shared";
import { billingActions } from "@/internal/billing/v2/actions";
import { billingPlanToPreviewResponse } from "@/internal/billing/v2/utils/billingPlanToPreviewResponse";
import { createRoute } from "../../../../honoMiddlewares/routeHandler";

export const handlePreviewUpdateSubscription = createRoute({
	versionedBody: {
		latest: UpdateSubscriptionV1ParamsSchema,
		[ApiVersion.V1_Beta]: UpdateSubscriptionV0ParamsSchema,
	},
	resource: AffectedResource.ApiSubscriptionUpdate,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const body = c.req.valid("json");

		console.log("body", body);

		const { billingContext, billingPlan } =
			await billingActions.updateSubscription({
				ctx,
				params: body,
				preview: true,
			});

		// 7. Format response
		const previewResponse = billingPlanToPreviewResponse({
			ctx,
			billingContext,
			billingPlan,
		});

		return c.json(previewResponse, 200);
	},
});

import {
	AffectedResource,
	type MultiAttachBillingContext,
	MultiAttachParamsV0Schema,
} from "@autumn/shared";
import { billingActions } from "@/internal/billing/v2/actions";
import { billingPlanToChanges } from "@/internal/billing/v2/utils/billingPlanToChanges.js";
import { billingPlanToPreviewResponse } from "@/internal/billing/v2/utils/billingPlanToPreviewResponse";
import { createRoute } from "../../../../honoMiddlewares/routeHandler";

export const handlePreviewMultiAttach = createRoute({
	versionedBody: {
		latest: MultiAttachParamsV0Schema,
	},
	resource: AffectedResource.MultiAttach,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const body = c.req.valid("json");

		const { billingContext, billingPlan } = await billingActions.multiAttach({
			ctx,
			params: body,
			preview: true,
		});

		if (!billingPlan) {
			throw new Error("Billing plan not found for preview");
		}

		const previewResponse = billingPlanToPreviewResponse({
			ctx,
			billingContext,
			billingPlan,
		});

		const { incoming, outgoing } = await billingPlanToChanges({
			ctx,
			billingContext,
			billingPlan,
		});

		return c.json(
			{
				...previewResponse,
				incoming,
				outgoing,
				redirect_type: (billingContext as MultiAttachBillingContext)
					.checkoutMode,
			},
			200,
		);
	},
});

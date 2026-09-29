import {
	AffectedResource,
	CreateScheduleParamsV0Schema,
	Scopes,
} from "@autumn/shared";
import { billingActions } from "@/internal/billing/v2/actions";
import { billingPlanToAttachPreview } from "@/internal/billing/v2/utils/billingPlan/billingPlanToAttachPreview";
import { createRoute } from "../../../../honoMiddlewares/routeHandler";

export const handlePreviewCreateSchedule = createRoute({
	scopes: [Scopes.Billing.Read],
	body: CreateScheduleParamsV0Schema,
	resource: AffectedResource.MultiAttach,
	handler: async (c) => {
		const ctx = c.get("ctx");

		const { billingContext, billingPlan } = await billingActions.setPlans({
			ctx,
			params: c.req.valid("json"),
			preview: true,
		});

		const preview = await billingPlanToAttachPreview({
			ctx,
			billingContext,
			billingPlan,
		});

		return c.json(preview, 200);
	},
});

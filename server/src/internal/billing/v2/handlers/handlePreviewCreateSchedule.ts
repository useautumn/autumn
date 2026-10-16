import {
	AffectedResource,
	CreateScheduleParamsV0Schema,
	Scopes,
} from "@autumn/shared";
import { billingPreviewPermissionFields } from "@/internal/approvals/preview/billingPreviewPermissionFields";
import { billingActions } from "@/internal/billing/v2/actions";
import { createScheduleParamsToSetPlansParams } from "@/internal/billing/v2/actions/setPlans/utils/createScheduleParamsToSetPlansParams";
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
			params: createScheduleParamsToSetPlansParams({
				params: c.req.valid("json"),
			}),
			preview: true,
		});

		const preview = await billingPlanToAttachPreview({
			ctx,
			billingContext,
			billingPlan,
		});

		const permissionFields = await billingPreviewPermissionFields({
			ctx,
			billingContext,
			billingPlan,
			preview,
			action: "billing.schedule",
		});

		return c.json({ ...preview, ...permissionFields }, 200);
	},
});

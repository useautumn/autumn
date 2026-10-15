import {
	AffectedResource,
	Scopes,
	SetPlansParamsV0Schema,
} from "@autumn/shared";
import { billingPreviewPermissionFields } from "@/internal/approvals/preview/billingPreviewPermissionFields";
import { billingActions } from "@/internal/billing/v2/actions";
import { buildSetPlansPreview } from "@/internal/billing/v2/actions/setPlans/preview/buildSetPlansPreview";
import { createRoute } from "../../../../honoMiddlewares/routeHandler";

export const handlePreviewSetPlans = createRoute({
	scopes: [Scopes.Billing.Read],
	body: SetPlansParamsV0Schema,
	resource: AffectedResource.MultiAttach,
	handler: async (c) => {
		const ctx = c.get("ctx");

		const result = await billingActions.setPlans({
			ctx,
			params: c.req.valid("json"),
			preview: true,
		});

		const preview = await buildSetPlansPreview({ ctx, result });
		const permissionFields = await billingPreviewPermissionFields({
			ctx,
			billingContext: result.billingContext,
			billingPlan: result.billingPlan,
			preview,
			action: "billing.set_plans",
			nextCycleStripeSubscriptionId:
				result.billingContext.stripeSubscription?.id,
		});

		return c.json({ ...preview, ...permissionFields }, 200);
	},
});

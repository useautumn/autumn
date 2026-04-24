import {
	AffectedResource,
	ApiVersion,
	AttachParamsV0Schema,
	AttachParamsV1Schema,
	Scopes,
} from "@autumn/shared";
import { billingActions } from "@/internal/billing/v2/actions";
import { createRoute } from "../../../../honoMiddlewares/routeHandler";
import { billingPlanToAttachPreview } from "../utils/billingPlan/billingPlanToAttachPreview";

export const handlePreviewAttach = createRoute({
	scopes: [Scopes.Billing.Read],
	versionedBody: {
		latest: AttachParamsV1Schema,
		[ApiVersion.V1_Beta]: AttachParamsV0Schema,
	},
	resource: AffectedResource.Attach,

	handler: async (c) => {
		const ctx = c.get("ctx");
		const body = c.req.valid("json");

		const { billingContext, billingPlan } = await billingActions.attach({
			ctx,
			params: body,
			preview: true,
		});

		// billingPlan is always present when preview: true
		if (!billingPlan) {
			throw new Error("Billing plan not found for preview");
		}

		// 7. Format response
		const previewResponse = await billingPlanToAttachPreview({
			ctx,
			billingContext,
			billingPlan,
		});

		return c.json(previewResponse, 200);
	},
});

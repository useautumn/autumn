import {
	AffectedResource,
	MultiAttachParamsV0Schema,
	Scopes,
} from "@autumn/shared";
import { billingApprovalToPreviewFields } from "@/internal/approvals/preview/billingApprovalToPreviewFields";
import { billingActions } from "@/internal/billing/v2/actions";
import { createRoute } from "../../../../honoMiddlewares/routeHandler";
import { billingPlanToAttachPreview } from "../utils/billingPlan/billingPlanToAttachPreview";

export const handlePreviewMultiAttach = createRoute({
	scopes: [Scopes.Billing.Read],
	versionedBody: {
		latest: MultiAttachParamsV0Schema,
	},
	resource: AffectedResource.MultiAttach,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const body = c.req.valid("json");

		const { billingContext, billingPlan, approval } =
			await billingActions.multiAttach({
				ctx,
				params: body,
				preview: true,
			});

		if (!billingPlan) {
			throw new Error("Billing plan not found for preview");
		}

		const previewResponse = await billingPlanToAttachPreview({
			ctx,
			billingContext,
			billingPlan,
		});

		return c.json(
			{ ...previewResponse, ...billingApprovalToPreviewFields({ approval }) },
			200,
		);
	},
});

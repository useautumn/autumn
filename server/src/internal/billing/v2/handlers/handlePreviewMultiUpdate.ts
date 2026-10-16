import {
	AffectedResource,
	InternalError,
	MultiUpdateParamsV0Schema,
	Scopes,
} from "@autumn/shared";
import { billingApprovalsToPreviewFields } from "@/internal/approvals/preview/billingApprovalsToPreviewFields";
import { billingActions } from "@/internal/billing/v2/actions";
import { createRoute } from "../../../../honoMiddlewares/routeHandler";

export const handlePreviewMultiUpdate = createRoute({
	scopes: [Scopes.Billing.Read],
	body: MultiUpdateParamsV0Schema,
	resource: AffectedResource.ApiSubscriptionUpdate,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const body = c.req.valid("json");

		const { previewResponse, approvals = [] } =
			await billingActions.multiUpdate({
				ctx,
				params: body,
				preview: true,
			});

		if (!previewResponse) {
			throw new InternalError({
				message: "previewResponse not returned from multiUpdate preview",
			});
		}

		return c.json(
			{ ...previewResponse, ...billingApprovalsToPreviewFields({ approvals }) },
			200,
		);
	},
});

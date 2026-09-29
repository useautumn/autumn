import {
	AffectedResource,
	CreateScheduleParamsV0Schema,
	Scopes,
} from "@autumn/shared";
import { billingActions } from "@/internal/billing/v2/actions";
import { createRoute } from "../../../../honoMiddlewares/routeHandler";

export const handlePreviewSetPlans = createRoute({
	scopes: [Scopes.Billing.Read],
	body: CreateScheduleParamsV0Schema,
	resource: AffectedResource.MultiAttach,
	handler: async (c) => {
		const preview = await billingActions.previewSetPlans({
			ctx: c.get("ctx"),
			params: c.req.valid("json"),
		});

		return c.json(preview, 200);
	},
});

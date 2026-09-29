import {
	AffectedResource,
	CreateScheduleParamsV0Schema,
	Scopes,
} from "@autumn/shared";
import { billingActions } from "@/internal/billing/v2/actions";
import { buildSetPlansPreview } from "@/internal/billing/v2/actions/setPlans/preview/buildSetPlansPreview";
import { createRoute } from "../../../../honoMiddlewares/routeHandler";

export const handlePreviewSetPlans = createRoute({
	scopes: [Scopes.Billing.Read],
	body: CreateScheduleParamsV0Schema,
	resource: AffectedResource.MultiAttach,
	handler: async (c) => {
		const ctx = c.get("ctx");

		const result = await billingActions.setPlans({
			ctx,
			params: c.req.valid("json"),
			preview: true,
		});

		return c.json(await buildSetPlansPreview({ ctx, result }), 200);
	},
});

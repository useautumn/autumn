import { AffectedResource, CreateScheduleParamsV0Schema } from "@autumn/shared";
import { billingActions } from "@/internal/billing/v2/actions";
import { createRoute } from "../../../../honoMiddlewares/routeHandler";

export const handlePreviewCreateSchedule = createRoute({
	body: CreateScheduleParamsV0Schema,
	resource: AffectedResource.MultiAttach,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const body = c.req.valid("json");

		const preview = await billingActions.previewCreateSchedule({
			ctx,
			params: body,
		});

		return c.json(preview, 200);
	},
});

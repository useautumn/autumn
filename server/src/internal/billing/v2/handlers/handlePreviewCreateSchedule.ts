import { AffectedResource, CreateScheduleParamsV0Schema } from "@autumn/shared";
import { previewCreateSchedule } from "@/internal/billing/v2/actions/createSchedule/previewCreateSchedule";
import { createRoute } from "../../../../honoMiddlewares/routeHandler";

export const handlePreviewCreateSchedule = createRoute({
	body: CreateScheduleParamsV0Schema,
	resource: AffectedResource.MultiAttach,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const body = c.req.valid("json");

		const preview = await previewCreateSchedule({ ctx, params: body });

		return c.json(preview, 200);
	},
});

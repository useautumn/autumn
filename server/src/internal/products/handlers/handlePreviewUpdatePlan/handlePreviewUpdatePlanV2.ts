import { PreviewUpdatePlanParamsV2Schema, Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { previewUpdatePlan } from "@/internal/product/actions/previewUpdatePlan/previewUpdatePlan.js";

export const handlePreviewUpdatePlanV2 = createRoute({
	scopes: [Scopes.Plans.Read],
	body: PreviewUpdatePlanParamsV2Schema,
	handler: async (c) => {
		const body = c.req.valid("json");
		const ctx = c.get("ctx");
		const preview = await previewUpdatePlan({ ctx, data: body });
		return c.json(preview);
	},
});

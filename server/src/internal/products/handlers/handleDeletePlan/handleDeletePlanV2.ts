import { AffectedResource, DeletePlanParamsV2Schema } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { deleteProduct } from "../../../product/actions/deleteProduct.js";

export const handleDeletePlanV2 = createRoute({
	body: DeletePlanParamsV2Schema,
	resource: AffectedResource.Product,
	handler: async (c) => {
		const { plan_id, all_versions } = c.req.valid("json");
		const { success } = await deleteProduct({
			ctx: c.get("ctx"),
			productId: plan_id,
			allVersions: all_versions,
		});

		return c.json({ success });
	},
});

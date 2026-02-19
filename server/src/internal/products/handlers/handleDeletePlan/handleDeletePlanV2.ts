import { AffectedResource, DeletePlanV2BodySchema } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { deleteProduct } from "../../actions/productActions/deleteProduct.js";

export const handleDeletePlanV2 = createRoute({
	body: DeletePlanV2BodySchema,
	resource: AffectedResource.Product,
	handler: async (c) => {
		const { plan_id, all_versions = false } = c.req.valid("json");
		const { success } = await deleteProduct({
			ctx: c.get("ctx"),
			productId: plan_id,
			allVersions: all_versions,
		});

		return c.json({ success });
	},
});

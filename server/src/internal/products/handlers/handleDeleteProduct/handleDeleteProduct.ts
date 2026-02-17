import { AffectedResource } from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { deleteProduct } from "../productActions/deleteProduct.js";

const DeleteProductParamsSchema = z.object({
	product_id: z.string(),
});

const DeleteProductQuerySchema = z.object({
	all_versions: z.boolean().default(false),
});

export const handleDeleteProduct = createRoute({
	params: DeleteProductParamsSchema,
	query: DeleteProductQuerySchema,
	resource: AffectedResource.Product,
	handler: async (c) => {
		const { product_id } = c.req.param();
		const { all_versions } = c.req.valid("query");
		const { success } = await deleteProduct({
			ctx: c.get("ctx"),
			productId: product_id,
			allVersions: all_versions,
		});

		return c.json({ success });
	},
});

import {
	AffectedResource,
	DeleteVariantParamsSchema,
	ProductNotFoundError,
	products,
} from "@autumn/shared";
import { and, eq } from "drizzle-orm";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { ProductService } from "../../ProductService.js";

export const handleDeleteVariant = createRoute({
	body: DeleteVariantParamsSchema,
	resource: AffectedResource.Product,
	handler: async (c) => {
		const { plan_id, variant_id } = c.req.valid("json");
		const { db, org, env } = c.get("ctx");

		const variant = await db.query.products.findFirst({
			where: and(
				eq(products.id, plan_id),
				eq(products.variant_id, variant_id),
				eq(products.org_id, org.id),
				eq(products.env, env),
			),
		});

		if (!variant) {
			throw new ProductNotFoundError({
				productId: `${plan_id}/${variant_id}`,
			});
		}

		await ProductService.deleteByInternalId({
			db,
			internalId: variant.internal_id,
			orgId: org.id,
			env,
		});

		return c.json({ success: true });
	},
});

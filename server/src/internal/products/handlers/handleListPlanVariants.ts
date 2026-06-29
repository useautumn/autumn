import { ProductNotFoundError, Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { ProductService } from "@/internal/products/ProductService";
import { mapToProductItems } from "@/internal/products/productV2Utils.js";

export const handleListPlanVariants = createRoute({
	scopes: [Scopes.Plans.Read],
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { db, org, env, features } = ctx;

		const productId = c.req.param().productId;
		if (!productId) throw new ProductNotFoundError({ productId: "" });

		const base = await ProductService.getFull({
			db,
			idOrInternalId: productId,
			orgId: org.id,
			env,
		});
		if (!base) throw new ProductNotFoundError({ productId });

		// Variants can be bound to any prior version's internal_id, so match the whole family.
		const family = await ProductService.listFull({
			db,
			orgId: org.id,
			env,
			inIds: [base.id],
			returnAll: true,
		});

		const variants = await ProductService.listVariantsByParent({
			db,
			baseInternalProductIds: family.map((p) => p.internal_id),
			orgId: org.id,
			env,
		});

		return c.json({
			variants: variants.map((v) => ({
				id: v.id,
				name: v.name,
				latest_version: v.version,
				items: mapToProductItems({
					prices: v.prices,
					entitlements: v.entitlements,
					features,
				}),
			})),
		});
	},
});

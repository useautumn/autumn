import {
	type CreatePlanParams,
	CreatePlanParamsSchema,
	planToProductV2,
	ProductNotFoundError,
	type ProductV2,
	productsAreSame,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import { ProductService } from "@/internal/products/ProductService";

/**
 * V3 endpoint that accepts CreatePlanParams format (what the CLI sends)
 * instead of requiring full ApiPlan format with server-side metadata.
 * 
 * This allows the CLI to send just the plan configuration fields
 * without needing to know about version, created_at, env, etc.
 */
export const handlePlanHasCustomersV3 = createRoute({
	body: CreatePlanParamsSchema,
	handler: async (c) => {
		const { product_id } = c.req.param();
		const ctx = c.get("ctx");
		const { db, features, org, env } = ctx;

		const body = c.req.valid("json") as CreatePlanParams;

		const product = await ProductService.getFull({
			db,
			idOrInternalId: product_id,
			orgId: org.id,
			env: env,
		});

		if (!product) {
			throw new ProductNotFoundError({ productId: product_id });
		}

		const cusProductsCurVersion =
			await CusProductService.getByInternalProductId({
				db,
				internalProductId: product.internal_id,
			});

		// Convert plan params to ProductV2 format for comparison
		// Cast is safe because productsAreSame only uses the items and free_trial fields
		const productV2 = planToProductV2({ plan: body, features }) as ProductV2;

		const { itemsSame, freeTrialsSame } = productsAreSame({
			newProductV2: productV2,
			curProductV1: product,
			features,
		});

		const productSame = itemsSame && freeTrialsSame;

		return c.json({
			current_version: product.version,
			will_version: !productSame && cusProductsCurVersion.length > 0,
			archived: product.archived,
		});
	},
});

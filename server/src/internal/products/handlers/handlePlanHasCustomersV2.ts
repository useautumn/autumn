import {
	ApiVersion,
	apiPlan,
	ProductNotFoundError,
	type ProductV2,
	productsAreSame,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import { ProductService } from "@/internal/products/ProductService";

export const handlePlanHasCustomersV2 = createRoute({
	handler: async (c) => {
		const { product_id } = c.req.param();
		const ctx = c.get("ctx");
		const { db, features, org, env, apiVersion } = ctx;

		const body = await c.req.json();

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

		// V2.0+ (CLI): body is CreatePlanParams, convert to ProductV2
		// < V2.0 (Dashboard): body is already ProductV2
		const productV2 = apiVersion.gte(ApiVersion.V2_0)
			? (apiPlan.map.paramsV1ToProductV2({
					ctx,
					params: body,
				}) as ProductV2)
			: (body as ProductV2);

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

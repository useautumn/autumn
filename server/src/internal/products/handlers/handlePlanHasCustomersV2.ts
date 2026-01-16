import {
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
		const { db, features, org, env } = ctx;

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

		const { itemsSame, freeTrialsSame } = productsAreSame({
			newProductV2: body as ProductV2,
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

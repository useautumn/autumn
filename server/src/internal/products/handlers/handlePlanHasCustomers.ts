import {
	AffectedResource,
	ProductNotFoundError,
	type ProductV2,
	productsAreSame,
} from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { CusProductService } from "../../customers/cusProducts/CusProductService.js";
import { ProductService } from "../ProductService.js";

const HasCustomersBodySchema = z.object({
	id: z.string().optional(),
	items: z.array(z.any()).optional(),
	free_trial: z.any().optional(),
});

export const handlePlanHasCustomers = createRoute({
	body: HasCustomersBodySchema,
	resource: AffectedResource.Product,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { db, features, org, env } = ctx;
		const { product_id } = c.req.param();
		const body = c.req.valid("json");

		const product = await ProductService.getFull({
			db,
			idOrInternalId: product_id,
			orgId: org.id,
			env,
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

import {
	AffectedResource,
	ProductNotFoundError,
	RecaseError,
} from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { CusProdReadService } from "@/internal/customers/cusProducts/CusProdReadService.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { invalidateProductsCache } from "../productCacheUtils.js";

const DeleteProductParamsSchema = z.object({
	product_id: z.string(),
});

const DeleteProductQuerySchema = z.object({
	all_versions: z.boolean(),
});

export const handleDeleteProduct = createRoute({
	params: DeleteProductParamsSchema,
	query: DeleteProductQuerySchema,
	resource: AffectedResource.Product,
	handler: async (c) => {
		const { product_id } = c.req.param();
		const { all_versions } = c.req.valid("query");
		const { db, org, env } = c.get("ctx");

		const product = await ProductService.get({
			db,
			id: product_id,
			orgId: org.id,
			env,
		});

		if (!product) {
			throw new ProductNotFoundError({ productId: product_id });
		}

		const [latestCounts, allCounts] = await Promise.all([
			CusProdReadService.getCounts({
				db,
				internalProductId: product.internal_id,
			}),
			CusProdReadService.getCountsForAllVersions({
				db,
				productId: product_id,
				orgId: org.id,
				env,
			}),
		]);

		const deleteAllVersions = all_versions === true;
		const cusProdCount = deleteAllVersions ? allCounts.all : latestCounts.all;

		if (cusProdCount > 0) {
			throw new RecaseError({
				message: `Product ${product_id} has ${cusProdCount} customers (expired or active) on it and therefore cannot be deleted`,
			});
		}

		// 2. Delete prices, entitlements, and product
		if (deleteAllVersions) {
			await ProductService.deleteByProductId({
				db,
				productId: product_id,
				orgId: org.id,
				env,
			});
		} else {
			await ProductService.deleteByInternalId({
				db,
				internalId: product.internal_id,
				orgId: org.id,
				env,
			});
		}

		await invalidateProductsCache({ orgId: org.id, env });

		return c.json({ success: true });
	},
});

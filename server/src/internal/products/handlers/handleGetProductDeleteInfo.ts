import { AffectedResource, ProductNotFoundError } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { CusProdReadService } from "@/internal/customers/cusProducts/CusProdReadService.js";
import { ProductService } from "../ProductService.js";

export const handleGetProductDeleteInfo = createRoute({
	resource: AffectedResource.Product,
	handler: async (c) => {
		// 1. Get number of versions
		const ctx = c.get("ctx");
		const { db, org, env } = ctx;
		const { productId } = c.req.param();

		const product = await ProductService.get({
			db,
			id: productId,
			orgId: org.id,
			env,
		});

		if (!product) {
			throw new ProductNotFoundError({ productId });
		}

		const [allVersions, latestVersion, deletionText] = await Promise.all([
			CusProdReadService.existsForProduct({
				db,
				productId,
			}),
			CusProdReadService.existsForProduct({
				db,
				internalProductId: product.internal_id,
			}),
			ProductService.getDeletionText({
				db,
				productId,
				orgId: org.id,
				env,
			}),
		]);

		return c.json({
			numVersion: product.version,
			hasCusProducts: allVersions,
			hasCusProductsLatest: latestVersion,
			customerName:
				deletionText[0]?.name || deletionText[0]?.email || deletionText[0]?.id,
			totalCount: deletionText[0]?.totalCount,
		});
	},
});

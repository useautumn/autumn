import { AffectedResource, ProductNotFoundError } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { CusProdReadService } from "../../customers/cusProducts/CusProdReadService.js";
import { ProductService } from "../ProductService.js";

export const handleGetPlanDeleteInfo = createRoute({
	resource: AffectedResource.Product,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { db, org, env } = ctx;
		const { product_id } = c.req.param();

		const product = await ProductService.get({
			db,
			id: product_id,
			orgId: org.id,
			env,
		});

		if (!product) {
			throw new ProductNotFoundError({ productId: product_id });
		}

		const [allVersions, latestVersion, deletionText] = await Promise.all([
			CusProdReadService.existsForProduct({
				db,
				productId: product_id,
			}),
			CusProdReadService.existsForProduct({
				db,
				internalProductId: product.internal_id,
			}),
			ProductService.getDeletionText({
				db,
				productId: product_id,
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

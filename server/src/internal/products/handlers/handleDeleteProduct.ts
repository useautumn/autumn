import { ProductNotFoundError, RecaseError } from "@autumn/shared";
import { CusProdReadService } from "@/internal/customers/cusProducts/CusProdReadService.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { routeHandler } from "@/utils/routerUtils.js";

export const handleDeleteProduct = (req: any, res: any) =>
	routeHandler({
		req,
		res,
		action: "delete product",
		handler: async () => {
			const { db, orgId, env } = req;
			const { productId } = req.params;
			const { all_versions } = req.query;

			const product = await ProductService.get({
				db,
				id: productId,
				orgId,
				env,
			});

			if (!product) {
				throw new ProductNotFoundError({ productId: productId });
			}

			const [latestCounts, allCounts] = await Promise.all([
				CusProdReadService.getCounts({
					db,
					internalProductId: product.internal_id,
				}),
				CusProdReadService.getCountsForAllVersions({
					db,
					productId: productId,
					orgId,
					env,
				}),
			]);

			const deleteAllVersions = all_versions === "true";
			const cusProdCount = deleteAllVersions ? allCounts.all : latestCounts.all;

			if (cusProdCount > 0) {
				throw new RecaseError({
					message: `Product ${productId} has ${cusProdCount} customers (expired or active) on it and therefore cannot be deleted`,
				});
			}

			// 2. Delete prices, entitlements, and product
			if (deleteAllVersions) {
				await ProductService.deleteByProductId({
					db,
					productId,
					orgId,
					env,
				});
			} else {
				await ProductService.deleteByInternalId({
					db,
					internalId: product.internal_id,
					orgId,
					env,
				});
			}

			res.status(200).json({ success: true });
			return;
		},
	});

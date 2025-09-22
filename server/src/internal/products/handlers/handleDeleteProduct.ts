import { CusProdReadService } from "@/internal/customers/cusProducts/CusProdReadService.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";

import { ProductService } from "@/internal/products/ProductService.js";
import RecaseError from "@/utils/errorUtils.js";
import { routeHandler } from "@/utils/routerUtils.js";
import { AppEnv, ErrCode } from "@autumn/shared";

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
				throw new RecaseError({
					message: `Product ${productId} not found`,
					code: ErrCode.ProductNotFound,
					statusCode: 404,
				});
			}

			let [latestCounts, allCounts] = await Promise.all([
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

			let deleteAllVersions = all_versions === "true";
			let cusProdCount = deleteAllVersions ? allCounts.all : latestCounts.all;

			if (cusProdCount > 0) {
				throw new RecaseError({
					message: "Cannot delete product with customers",
					code: ErrCode.ProductHasCustomers,
					statusCode: 400,
				});
			}

			// if (cusProdCount > 0 && env == AppEnv.Sandbox) {
			//   if (cusProdCount > 100) {
			//     throw new RecaseError({
			//       message:
			//         "Cannot delete this product as it has more than 100 customers on it.",
			//       code: ErrCode.ProductHasCustomers,
			//       statusCode: 400,
			//     });
			//   }

			//   await CusProductService.deleteByProduct({
			//     db,
			//     productId: deleteAllVersions ? productId : undefined,
			//     internalProductId: deleteAllVersions
			//       ? undefined
			//       : product.internal_id,
			//     orgId,
			//     env,
			//   });
			// }

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

			res.status(200).json({ message: "Product deleted" });
			return;
		},
	});

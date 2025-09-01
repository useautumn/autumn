import { ErrCode } from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { getProductResponse } from "@/internal/products/productUtils/productResponseUtils/getProductResponse.js";
import RecaseError from "@/utils/errorUtils.js";
import type {
	ExtendedRequest,
	ExtendedResponse,
} from "@/utils/models/Request.js";
import { routeHandler } from "@/utils/routerUtils.js";

export const handleGetProduct = async (req: any, res: any) =>
	routeHandler({
		req,
		res,
		action: "get product",
		handler: async (req: ExtendedRequest, res: ExtendedResponse) => {
			const { productId } = req.params;
			const { schemaVersion } = req.query as { schemaVersion: string };

			const { db, orgId, env } = req;

			if (!productId) {
				throw new RecaseError({
					message: "Product ID is required",
					code: ErrCode.InvalidRequest,
				});
			}

			const [product, features] = await Promise.all([
				ProductService.getFull({
					db,
					orgId,
					env,
					idOrInternalId: productId,
				}),
				FeatureService.getFromReq(req),
			]);

			if (!product) {
				throw new RecaseError({
					message: `Product ${productId} not found`,
					code: ErrCode.ProductNotFound,
					statusCode: StatusCodes.NOT_FOUND,
				});
			}

			const schemaVersionInt = schemaVersion ? parseInt(schemaVersion, 10) : 2;

			if (schemaVersionInt === 1) {
				res.status(200).json(product);
			} else {
				res.status(200).json(
					await getProductResponse({
						product,
						features,
					}),
				);
			}
		},
	});

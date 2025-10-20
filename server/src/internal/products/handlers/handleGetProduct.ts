import {
	AffectedResource,
	type ApiPlan,
	applyResponseVersionChanges,
	ErrCode,
	ProductNotFoundError,
} from "@autumn/shared";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { ProductService } from "@/internal/products/ProductService.js";
import RecaseError from "@/utils/errorUtils.js";
import type {
	ExtendedRequest,
	ExtendedResponse,
} from "@/utils/models/Request.js";
import { routeHandler } from "@/utils/routerUtils.js";
import { getPlanResponse } from "../productUtils/productResponseUtils/getPlanResponse.js";

export const handleGetProduct = async (req: any, res: any) =>
	routeHandler({
		req,
		res,
		action: "get product",
		handler: async (
			req: ExtendedRequest,
			res: ExtendedResponse,
		): Promise<any> => {
			const { productId } = req.params;
			const { schemaVersion } = req.query as { schemaVersion: string };

			const { db, orgId, env, apiVersion } = req;

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
				throw new ProductNotFoundError({ productId: productId });
			}

			const schemaVersionInt = schemaVersion ? parseInt(schemaVersion) : 2;

			if (schemaVersionInt === 1) return res.status(200).json(product);

			const planResponse = await getPlanResponse({
				product,
				features,
			});

			const versionedResponse = applyResponseVersionChanges<ApiPlan>({
				input: planResponse,
				targetVersion: apiVersion,
				resource: AffectedResource.Product,
			});

			return res.status(200).json(versionedResponse);
		},
	});

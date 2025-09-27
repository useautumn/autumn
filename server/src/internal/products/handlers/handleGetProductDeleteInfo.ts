import { ErrCode } from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import { CusProdReadService } from "@/internal/customers/cusProducts/CusProdReadService.js";
import RecaseError, { handleRequestError } from "@/utils/errorUtils.js";
import type { ExtendedRequest } from "@/utils/models/Request.js";
import { routeHandler } from "@/utils/routerUtils.js";
import { ProductService } from "../ProductService.js";

export const handleGetProductDeleteInfo = async (req: any, res: any) =>
	routeHandler({
		req,
		res,
		action: "Get product deletion info",
		handler: async (req: ExtendedRequest, res: any) => {
			try {
				// 1. Get number of versions
				const { db } = req;
				const product = await ProductService.get({
					db,
					id: req.params.productId,
					orgId: req.orgId,
					env: req.env,
				});

				if (!product) {
					throw new RecaseError({
						message: `Product ${req.params.productId} not found`,
						code: ErrCode.ProductNotFound,
						statusCode: StatusCodes.NOT_FOUND,
					});
				}

				const [allVersions, latestVersion, deletionText] = await Promise.all([
					CusProdReadService.existsForProduct({
						db,
						productId: req.params.productId,
					}),
					CusProdReadService.existsForProduct({
						db,
						internalProductId: product.internal_id,
					}),
					ProductService.getDeletionText({
						db,
						productId: req.params.productId,
						orgId: req.orgId,
						env: req.env,
					}),
				]);

				console.log("Getting product info for", req.params.productId);
				console.log("All versions:", allVersions);
				console.log("Latest version:", latestVersion);
				console.log("Deletion text:", deletionText);

				// 2. Get cus products

				res.status(200).send({
					numVersion: product.version,
					hasCusProducts: allVersions,
					hasCusProductsLatest: latestVersion,
					customerName:
						deletionText[0]?.name ||
						deletionText[0]?.email ||
						deletionText[0]?.id,
					totalCount: deletionText[0]?.totalCount,
				});
			} catch (error) {
				handleRequestError({
					error,
					req,
					res,
					action: "Get product info",
				});
			}
		},
	});

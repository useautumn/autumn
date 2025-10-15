import {
	CreateFeatureSchema,
	ErrCode,
	ProductAlreadyExistsError,
} from "@autumn/shared";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { initNewFeature } from "@/internal/features/internalFeatureRouter.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { copyProduct } from "@/internal/products/productUtils.js";
import RecaseError from "@/utils/errorUtils.js";
import { routeHandler } from "@/utils/routerUtils.js";

export const handleCopyProduct = async (req: any, res: any) =>
	routeHandler({
		req,
		res,
		action: "Copy Product",
		handler: async (req, res) => {
			const { db, logtail: logger } = req;

			const { productId: fromProductId } = req.params;
			const orgId = req.orgId;
			const fromEnv = req.env;
			const { env: toEnv, id: toId, name: toName } = req.body;

			if (!toEnv || !toId || !toName) {
				throw new RecaseError({
					message: "env, id, and name are required",
					code: ErrCode.InvalidRequest,
					statusCode: 400,
				});
			}

			if (fromEnv === toEnv && fromProductId === toId) {
				throw new RecaseError({
					message: "Product ID already exists",
					code: ErrCode.InvalidRequest,
					statusCode: 400,
				});
			}

			// 1. Check if product exists in live already...
			const toProduct = await ProductService.get({
				db,
				id: toId,
				orgId,
				env: toEnv,
			});

			if (toProduct) {
				throw new ProductAlreadyExistsError({
					productId: toId,
					message: `Product ${toId} already exists in ${toEnv}`,
				});
			}

			// 1. Get sandbox product
			const [fromFullProduct, fromFeatures, toFeatures] = await Promise.all([
				ProductService.getFull({
					db,
					idOrInternalId: fromProductId,
					orgId,
					env: fromEnv,
				}),
				FeatureService.list({
					db,
					orgId,
					env: fromEnv,
				}),
				FeatureService.list({
					db,
					orgId,
					env: toEnv,
				}),
			]);

			if (fromEnv !== toEnv) {
				for (const fromFeature of fromFeatures) {
					const toFeature = toFeatures.find((f) => f.id === fromFeature.id);

					if (toFeature && fromFeature.type !== toFeature.type) {
						throw new RecaseError({
							message: `Feature ${fromFeature.name} exists in ${toEnv}, but has a different config. Please match them then try again.`,
							code: ErrCode.InvalidRequest,
							statusCode: 400,
						});
					}

					if (!toFeature) {
						const res = await FeatureService.insert({
							db,
							data: initNewFeature({
								data: CreateFeatureSchema.parse(fromFeature),
								orgId,
								env: toEnv,
							}),
							logger,
						});

						toFeatures.push(res![0]);
					}
				}
			}

			// // 2. Copy product
			await copyProduct({
				db,
				product: fromFullProduct,
				toOrgId: orgId,
				toId,
				toName,
				fromEnv,
				toEnv: toEnv,
				toFeatures,
				fromFeatures,
				org: req.org,
				logger,
			});

			// 2. Get product from sandbox
			res.status(200).send({ message: "Product copied" });
		},
	});

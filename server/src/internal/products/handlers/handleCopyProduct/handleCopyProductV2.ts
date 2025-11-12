import {
	CopyProductParamsSchema,
	CreateFeatureSchema,
	ErrCode,
	ProductAlreadyExistsError,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { initNewFeature } from "@/internal/features/internalFeatureRouter.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { copyProduct } from "@/internal/products/productUtils.js";
import RecaseError from "@/utils/errorUtils.js";

/**
 * Route: POST /v1/products/:productId/copy - Copy a product
 */
export const handleCopyProductV2 = createRoute({
	body: CopyProductParamsSchema,
	handler: async (c) => {
		const body = c.req.valid("json");
		const ctx = c.get("ctx");

		const { db, logger, org, env: fromEnv } = ctx;
		const { product_id: fromProductId } = c.req.param();
		const { env: toEnv, id: toId, name: toName } = body;

		if (fromEnv === toEnv && fromProductId === toId) {
			throw new RecaseError({
				message: "Product ID already exists",
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}

		// 1. Check if product exists in target environment
		const toProduct = await ProductService.get({
			db,
			id: toId,
			orgId: org.id,
			env: toEnv,
		});

		if (toProduct) {
			throw new ProductAlreadyExistsError({
				productId: toId,
				message: `Product ${toId} already exists in ${toEnv}`,
			});
		}

		// 2. Get source product and features from both environments
		const [fromFullProduct, fromFeatures, toFeatures] = await Promise.all([
			ProductService.getFull({
				db,
				idOrInternalId: fromProductId,
				orgId: org.id,
				env: fromEnv,
			}),
			FeatureService.list({
				db,
				orgId: org.id,
				env: fromEnv,
			}),
			FeatureService.list({
				db,
				orgId: org.id,
				env: toEnv,
			}),
		]);

		// 3. Sync features between environments if copying across environments
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
							orgId: org.id,
							env: toEnv,
						}),
						logger,
					});

					toFeatures.push(res![0]);
				}
			}
		}

		// 4. Copy product
		await copyProduct({
			db,
			product: fromFullProduct,
			toOrgId: org.id,
			toId,
			toName,
			fromEnv,
			toEnv,
			toFeatures,
			fromFeatures,
			org,
			logger,
		});

		return c.json({ message: "Product copied" });
	},
});

import { Router } from "express";
import { handleFrontendReqError } from "@/utils/errorUtils.js";
import { EntitlementService } from "./entitlements/EntitlementService.js";
import { handleGetProductDeleteInfo } from "./handlers/handleGetProductDeleteInfo.js";

export const expressProductRouter: Router = Router({ mergeParams: true });

expressProductRouter.get("/:productId/info", handleGetProductDeleteInfo);

expressProductRouter.get(
	"/has_entity_feature_id",
	async (req: any, res: any) => {
		try {
			const { db, orgId, env } = req;

			const hasEntityFeatureId = await EntitlementService.hasEntityFeatureId({
				db,
				orgId,
				env,
			});

			res.status(200).send({ hasEntityFeatureId });
		} catch (error) {
			handleFrontendReqError({
				error,
				req,
				res,
				action: "Check has entity feature id",
			});
		}
	},
);

import { Hono } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { handleGetProducts } from "@/internal/products/internalHandlers/handleGetProducts.js";
import { handleCopyEnvironment } from "./handlers/handleCopyEnvironment/handleCopyEnvironment.js";
import { handleGetFeatures } from "./internalHandlers/handleGetFeatures.js";
import { handleGetMigrations } from "./internalHandlers/handleGetMigrations.js";
import { handleGetProductCount } from "./internalHandlers/handleGetProductCount.js";
import { handleGetProductCounts } from "./internalHandlers/handleGetProductCounts.js";
import { handleGetProductInternal } from "./internalHandlers/handleGetProductInternal.js";
import { handleGetRewards } from "./internalHandlers/handleGetRewards.js";

// Hono router for internal/dashboard product routes
export const internalProductRouter = new Hono<HonoEnv>();

internalProductRouter.get("/products", ...handleGetProducts);
internalProductRouter.get("/product_counts", ...handleGetProductCounts);
internalProductRouter.get("/features", ...handleGetFeatures);
internalProductRouter.get("/rewards", ...handleGetRewards);
internalProductRouter.get("/migrations", ...handleGetMigrations);

// SINGLE PRODUCT ENDPOINTS
internalProductRouter.get("/:productId/count", ...handleGetProductCount);
internalProductRouter.get("/:productId/data", ...handleGetProductInternal);
internalProductRouter.post("/copy_to_production", ...handleCopyEnvironment);

import { Router } from "express";
import { EntitlementService } from "./entitlements/EntitlementService.js";
import { handleGetProductDeleteInfo } from "./handlers/handleGetProductDeleteInfo.js";

export const expressProductRouter: Router = Router({ mergeParams: true });

import { Hono } from "hono";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
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
internalProductRouter.get("/:productId/info", ...handleGetProductDeleteInfo);
internalProductRouter.get(
	"/has_entity_feature_id",
	...createRoute({
		handler: async (c) => {
			const ctx = c.get("ctx");
			const { db, org, env } = ctx;

			const hasEntityFeatureId = await EntitlementService.hasEntityFeatureId({
				db,
				orgId: org.id,
				env,
			});

			return c.json({ hasEntityFeatureId });
		},
	}),
);

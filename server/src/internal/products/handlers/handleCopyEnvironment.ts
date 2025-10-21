import { AppEnv } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { handleCopyFeatures } from "./handleCopyEnvironment/handleCopyFeatures.js";
import { handleCopyProducts } from "./handleCopyEnvironment/handleCopyProducts.js";

/**
 * POST /copy_to_production
 * Copies all products and features from sandbox to production
 */
export const handleCopyEnvironment = createRoute({
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { db, org, logger } = ctx;

		// Always copy from sandbox to live
		const fromEnv = AppEnv.Sandbox;
		const toEnv = AppEnv.Live;

		// 1. Get all sandbox products and features
		const [sandboxFeatures, liveFeatures] = await Promise.all([
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

		// 2. Copy features first
		await handleCopyFeatures({
			ctx,
			sandboxFeatures,
			liveFeatures,
		});

		await handleCopyProducts({
			ctx,
			fromEnv,
			toEnv,
		});

		return c.json({
			message: "Products copied to production",
		});
	},
});

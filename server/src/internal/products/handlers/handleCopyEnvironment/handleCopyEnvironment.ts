import { AppEnv, Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { invalidateProductsCache } from "../../productCacheUtils.js";
import { handleCopyFeatures } from "./handleCopyFeatures.js";
import { handleCopyProducts } from "./handleCopyProducts.js";

/**
 * POST /copy_to_production
 * Copies all products and features from sandbox to production
 */
export const handleCopyEnvironment = createRoute({
	scopes: [Scopes.Plans.Write],
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { db, org } = ctx;

		// Always copy from sandbox to live
		const fromEnv = AppEnv.Sandbox;
		const toEnv = AppEnv.Live;

		// 1. Get all sandbox products and features
		const [fromFeatures, toFeatures] = await Promise.all([
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
			fromFeatures,
			toOrg: org,
			toEnv,
			toFeatures,
		});

		await handleCopyProducts({
			ctx,
			fromOrg: org,
			fromEnv,
			toOrg: org,
			toEnv,
		});

		await Promise.all([
			OrgService.update({ db, orgId: org.id, updates: { deployed: true } }),
			invalidateProductsCache({ orgId: org.id, env: toEnv }),
		]);

		return c.json({
			message: "Products copied to production",
		});
	},
});

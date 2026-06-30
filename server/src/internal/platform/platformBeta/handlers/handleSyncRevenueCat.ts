import { AppEnv, Scopes, SyncRevenueCatSchema } from "@autumn/shared";
import { syncProductsToRevenueCat } from "@/external/revenueCat/sync/syncRevenueCatProducts.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { PlanService } from "@/internal/products/PlanService.js";
import { validatePlatformOrg } from "../utils/validatePlatformOrg.js";

/**
 * POST /platform.sync_revenuecat — push a managed org's plans into RevenueCat.
 * Omit product_ids to sync every plan in the org/env.
 */
export const handleSyncRevenueCat = createRoute({
	scopes: [Scopes.Platform.Write],
	// Accepts "test"/"sandbox"/"live" — "test" + "sandbox" both map to AppEnv.Sandbox below.
	body: SyncRevenueCatSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { db, org: masterOrg } = ctx;
		const { organization_slug, env, product_ids } = c.req.valid("json");
		const appEnv = env === "live" ? AppEnv.Live : AppEnv.Sandbox;

		const org = await validatePlatformOrg({
			db,
			organizationSlug: organization_slug,
			masterOrg,
		});

		const targetCtx = { ...ctx, org, env: appEnv };

		let productIds = product_ids;
		if (!productIds) {
			const products = await PlanService.listFull({
				db,
				orgId: org.id,
				env: appEnv,
			});
			productIds = products.map((p) => p.id);
		}

		const results = await syncProductsToRevenueCat({
			ctx: targetCtx,
			productIds,
		});

		return c.json({ results });
	},
});

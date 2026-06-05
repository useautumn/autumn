import { Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { RCMappingService } from "../misc/RCMappingService.js";

/**
 * POST /v1/plans.revenuecat_mappings — returns each Autumn plan's RevenueCat store
 * product identifier(s) for the calling org/env, so SDK implementers can map a plan
 * to the product to purchase without reconstructing the identifier themselves.
 */
export const handleListRevenueCatMappings = createRoute({
	scopes: [Scopes.Plans.Read],
	handler: async (c) => {
		const { db, org, env } = c.get("ctx");

		const rows = await RCMappingService.getAll({ db, orgId: org.id, env });

		return c.json({
			mappings: rows.map((row) => ({
				autumn_product_id: row.autumn_product_id,
				revenuecat_product_ids: row.revenuecat_product_ids,
			})),
		});
	},
});

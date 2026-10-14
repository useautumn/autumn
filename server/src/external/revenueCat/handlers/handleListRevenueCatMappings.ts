import { Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { RCMappingService } from "../misc/RCMappingService.js";

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

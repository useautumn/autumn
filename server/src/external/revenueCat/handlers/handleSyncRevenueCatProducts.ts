import { Scopes } from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { syncProductsToRevenueCat } from "../sync/syncRevenueCatProducts.js";

/** POST /v1/organization/revenuecat/sync — push selected Autumn plans into RevenueCat. */
export const handleSyncRevenueCatProducts = createRoute({
	scopes: [Scopes.Organisation.Write],
	body: z.object({ product_ids: z.array(z.string()).min(1) }),
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { product_ids } = c.req.valid("json");

		const results = await syncProductsToRevenueCat({
			ctx,
			productIds: product_ids,
		});

		return c.json({ results });
	},
});

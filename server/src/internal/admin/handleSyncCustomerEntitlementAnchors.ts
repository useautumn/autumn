import { Scopes } from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { syncCustomerEntitlementAnchors } from "@/internal/customers/cusProducts/cusEnts/actions/syncCustomerEntitlementAnchors";

export const handleSyncCustomerEntitlementAnchors = createRoute({
	scopes: [Scopes.Superuser],
	body: z.object({
		customer_entitlement_ids: z.array(z.string()).min(1),
	}),
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { customer_entitlement_ids } = c.req.valid("json");
		const result = await syncCustomerEntitlementAnchors({
			ctx,
			customerEntitlementIds: customer_entitlement_ids,
		});

		return c.json(result);
	},
});

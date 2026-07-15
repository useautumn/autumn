import { LicenseListParamsSchema, Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { listLicenses } from "../actions/assignments/list/listLicenses.js";

export const handleListLicenses = createRoute({
	scopes: [Scopes.Billing.Read],
	body: LicenseListParamsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const body = c.req.valid("json");
		const balances = await listLicenses({
			ctx,
			customerId: body.customer_id,
			entityId: body.entity_id,
		});

		return c.json({ list: balances });
	},
});

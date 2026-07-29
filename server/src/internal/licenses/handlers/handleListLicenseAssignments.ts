import { LicenseListAssignmentsParamsSchema, Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { listLicenseAssignments } from "../actions/assignments/list/listLicenseAssignments.js";

export const handleListLicenseAssignments = createRoute({
	scopes: [Scopes.Billing.Read],
	body: LicenseListAssignmentsParamsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const body = c.req.valid("json");
		const assignments = await listLicenseAssignments({
			ctx,
			customerId: body.customer_id,
			entityId: body.entity_id,
			planId: body.plan_id,
			active: body.active,
		});

		return c.json({ list: assignments });
	},
});

import { CreateCustomerExportParamsSchema, Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { startCustomerExport } from "../exports/actions/startCustomerExport.js";
import { assertCanApplyCustomPlans } from "../exports/customPlans/assertCanApplyCustomPlans.js";

export const handleCreateCustomerExport = createRoute({
	scopes: [Scopes.Customers.Read],
	body: CreateCustomerExportParamsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const params = c.req.valid("json");
		assertCanApplyCustomPlans({ ctx, params });
		return c.json(await startCustomerExport({ ctx, params }));
	},
});

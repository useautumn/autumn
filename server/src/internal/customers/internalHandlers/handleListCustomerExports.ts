import { ListCustomerExportsQuerySchema, Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { listCustomerExports } from "../exports/actions/listCustomerExports.js";

export const handleListCustomerExports = createRoute({
	scopes: [Scopes.Customers.Read],
	query: ListCustomerExportsQuerySchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const query = c.req.valid("query");
		return c.json(await listCustomerExports({ ctx, query }));
	},
});

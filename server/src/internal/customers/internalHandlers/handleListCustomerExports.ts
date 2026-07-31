import { ListCustomerExportsQuerySchema, Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { CustomerExportService } from "../exports/CustomerExportService.js";
import { customerExportToResponse } from "../exports/customerExportToResponse.js";

export const handleListCustomerExports = createRoute({
	scopes: [Scopes.Customers.Read],
	query: ListCustomerExportsQuerySchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { limit } = c.req.valid("query");

		const customerExports = await CustomerExportService.list({
			db: ctx.db,
			orgId: ctx.org.id,
			env: ctx.env,
			limit,
		});

		return c.json({
			exports: customerExports.map((customerExport) =>
				customerExportToResponse({ customerExport }),
			),
		});
	},
});

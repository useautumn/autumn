import {
	CustomerExportStatus,
	type DbCustomerExport,
	ListCustomerExportsQuerySchema,
	Scopes,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { CustomerExportService } from "../exports/CustomerExportService.js";
import { getCustomerExportProgress } from "../exports/customerExportProgress.js";
import { customerExportToResponse } from "../exports/customerExportToResponse.js";

/** At most one export is running per org, so this costs one API call per poll. */
const hasLiveProgress = (customerExport: DbCustomerExport) =>
	customerExport.status === CustomerExportStatus.Running &&
	customerExport.trigger_run_id !== null;

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

		const exports = await Promise.all(
			customerExports.map(async (customerExport) => {
				const progress =
					hasLiveProgress(customerExport) && customerExport.trigger_run_id
						? await getCustomerExportProgress({
								triggerRunId: customerExport.trigger_run_id,
								logger: ctx.logger,
							})
						: null;

				return customerExportToResponse({ customerExport, progress });
			}),
		);

		return c.json({ exports });
	},
});

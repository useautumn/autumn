import {
	ACTIVE_CUSTOMER_EXPORT_STATUSES,
	CustomerExportStatus,
	type DbCustomerExport,
	ListCustomerExportsQuerySchema,
	Scopes,
} from "@autumn/shared";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { CustomerExportService } from "../exports/CustomerExportService.js";
import { getCustomerExportProgress } from "../exports/customerExportProgress.js";
import { createCustomerExportRealtimeToken } from "../exports/customerExportRealtimeToken.js";
import { customerExportToResponse } from "../exports/customerExportToResponse.js";

/**
 * At most one export is active per org, so a poll costs one progress read plus
 * one token mint. Queued runs get a token too, so the dashboard is already
 * subscribed before the first row lands.
 */
const toExportResponse = async ({
	customerExport,
	logger,
}: {
	customerExport: DbCustomerExport;
	logger: Logger;
}) => {
	const triggerRunId = customerExport.trigger_run_id;
	const isActive = ACTIVE_CUSTOMER_EXPORT_STATUSES.some(
		(status) => status === customerExport.status,
	);
	if (!(triggerRunId && isActive)) {
		return customerExportToResponse({ customerExport });
	}

	const [progress, publicAccessToken] = await Promise.all([
		customerExport.status === CustomerExportStatus.Running
			? getCustomerExportProgress({ triggerRunId, logger })
			: null,
		createCustomerExportRealtimeToken({ triggerRunId, logger }),
	]);

	return customerExportToResponse({
		customerExport,
		progress,
		publicAccessToken,
	});
};

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
			customerExports.map((customerExport) =>
				toExportResponse({ customerExport, logger: ctx.logger }),
			),
		);

		return c.json({ exports });
	},
});

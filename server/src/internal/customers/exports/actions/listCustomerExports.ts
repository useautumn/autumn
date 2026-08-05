import {
	CustomerExportStatus,
	type DbCustomerExport,
	isCustomerExportActive,
	type ListCustomerExportsQuery,
	type ListCustomerExportsResponse,
} from "@autumn/shared";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CustomerExportService } from "../CustomerExportService.js";
import { getCustomerExportProgress } from "../customerExportProgress.js";
import { createCustomerExportRealtimeToken } from "../customerExportRealtimeToken.js";
import { customerExportToResponse } from "../customerExportToResponse.js";

const toExportResponse = async ({
	customerExport,
	logger,
}: {
	customerExport: DbCustomerExport;
	logger: Logger;
}) => {
	const triggerRunId = customerExport.trigger_run_id;
	if (!(triggerRunId && isCustomerExportActive(customerExport))) {
		return customerExportToResponse({ customerExport });
	}

	// Queued runs get a token before progress exists so realtime is ready at start.
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

export const listCustomerExports = async ({
	ctx,
	query,
}: {
	ctx: AutumnContext;
	query: ListCustomerExportsQuery;
}): Promise<ListCustomerExportsResponse> => {
	const scope = { db: ctx.db, orgId: ctx.org.id, env: ctx.env };

	const [customerExports, total] = await Promise.all([
		CustomerExportService.list({
			...scope,
			limit: query.limit,
			offset: query.offset,
		}),
		CustomerExportService.count(scope),
	]);

	const exports = await Promise.all(
		customerExports.map((customerExport) =>
			toExportResponse({ customerExport, logger: ctx.logger }),
		),
	);

	return {
		exports,
		total,
		limit: query.limit,
		offset: query.offset,
		has_more: query.offset + exports.length < total,
	};
};

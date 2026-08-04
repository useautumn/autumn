import { CustomerExportStatus, type DbCustomerExport } from "@autumn/shared";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { RunCustomerExportPayload } from "@/trigger/exports/customerExportTaskPayload.js";
import { CustomerExportService } from "../../CustomerExportService.js";
import { reconcileUploadedExport } from "./reconcileUploadedExport.js";

/** Null means this attempt has nothing to run: reconciled or already resolved. */
export const resolveRunnableExport = async ({
	ctx,
	logger,
	payload,
	bucket,
	region,
}: {
	ctx: AutumnContext;
	logger: Logger;
	payload: RunCustomerExportPayload;
	bucket: string;
	region: string;
}): Promise<DbCustomerExport | null> => {
	const { exportId, orgId, env } = payload;
	const customerExport = await CustomerExportService.get({
		db: ctx.db,
		id: exportId,
		orgId,
		env,
	});

	if (!customerExport) {
		throw new Error(`Customer export ${exportId} not found`);
	}

	// Idempotency means only this export's retry sees Running: reconcile or restart.
	if (customerExport.status === CustomerExportStatus.Running) {
		const reconciled = await reconcileUploadedExport({
			ctx,
			logger,
			customerExport,
			bucket,
			region,
		});
		return reconciled ? null : customerExport;
	}

	if (customerExport.status !== CustomerExportStatus.Queued) {
		logger.warn("customer-export: skipping non-active export", {
			data: { exportId, status: customerExport.status },
		});
		return null;
	}

	return customerExport;
};

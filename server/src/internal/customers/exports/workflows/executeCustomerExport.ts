import {
	CUSTOMER_EXPORT_FILE_NAME,
	getCustomerExportKey,
	getCustomerExportsS3Config,
} from "@/external/aws/s3/customerExportsS3Config.js";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { RunCustomerExportPayload } from "@/trigger/exports/customerExportTaskPayload.js";
import { CustomerExportService } from "../CustomerExportService.js";
import { markCompletedWithRetry } from "./complete/markCompletedWithRetry.js";
import type { CustomerExportProgressReporter } from "./customerExportProgressReporter.js";
import { resolveRunnableExport } from "./setup/resolveRunnableExport.js";
import { uploadCustomerExportCsv } from "./upload/uploadCustomerExportCsv.js";

export const executeCustomerExport = async ({
	ctx,
	logger,
	payload,
	isFinalAttempt = true,
	progress,
}: {
	ctx: AutumnContext;
	logger: Logger;
	payload: RunCustomerExportPayload;
	isFinalAttempt?: boolean;
	progress?: CustomerExportProgressReporter;
}) => {
	const { exportId, orgId, env } = payload;
	const { bucket, region } = getCustomerExportsS3Config();

	// 1. Resolve the row this attempt should act on
	const customerExport = await resolveRunnableExport({
		ctx,
		logger,
		payload,
		bucket,
		region,
	});
	if (!customerExport) return;

	// 2. Count and stream; nothing is published if this throws
	const key = getCustomerExportKey({ orgId, env, exportId });
	let totals: { rowCount: number; byteCount: number };
	try {
		totals = await uploadCustomerExportCsv({
			ctx,
			logger,
			customerExport,
			payload,
			bucket,
			region,
			key,
			progress,
		});
	} catch (error) {
		// Earlier attempts stay active because the next attempt restarts the upload.
		if (isFinalAttempt) {
			await CustomerExportService.markFailed({
				db: ctx.db,
				id: exportId,
				errorMessage: error instanceof Error ? error.message : String(error),
			});
		}
		throw error;
	}

	// 3. The file is published, so completion failures propagate for a retry to reconcile
	const completed = await markCompletedWithRetry({
		ctx,
		logger,
		exportId,
		rowCount: totals.rowCount,
		byteCount: totals.byteCount,
	});
	if (completed) {
		logger.info("customer-export: completed", {
			data: { exportId, ...totals, fileName: CUSTOMER_EXPORT_FILE_NAME },
		});
	}
};

import {
	CustomerExportStatus,
	type DbCustomerExport,
	ms,
} from "@autumn/shared";
import {
	CUSTOMER_EXPORT_FILE_NAME,
	getCustomerExportKey,
	getCustomerExportsS3Config,
} from "@/external/aws/s3/customerExportsS3Config.js";
import { headS3Object } from "@/external/aws/s3/s3ObjectUtils.js";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { RunCustomerExportPayload } from "@/trigger/exports/customerExportTaskPayload.js";
import { retryAsync } from "@/utils/retryAsync.js";
import { CustomerExportService } from "../CustomerExportService.js";
import {
	countCustomerExportRows,
	getCustomerExportUpperBound,
} from "../queries/getCustomerExportScalars.js";
import { streamCustomerExportCsv } from "./streamCustomerExportCsv.js";

const MARK_COMPLETED_ATTEMPTS = 3;
const MARK_COMPLETED_RETRY_DELAY_MS = ms.seconds(2);

type CustomerExportProgressReporter = {
	setTotalRows: (rowCount: number) => Promise<void> | void;
	resetProcessedRows: () => Promise<void> | void;
	incrementProcessedRows: (rowCount: number) => Promise<void> | void;
};

/** The object is already published, so transient status writes are retried. */
const markCompletedWithRetry = async ({
	ctx,
	logger,
	exportId,
	rowCount,
	byteCount,
}: {
	ctx: AutumnContext;
	logger: Logger;
	exportId: string;
	rowCount: number | null;
	byteCount: number | null;
}) =>
	retryAsync({
		attempts: MARK_COMPLETED_ATTEMPTS,
		delayMs: MARK_COMPLETED_RETRY_DELAY_MS,
		onRetry: ({ attempt, error }) =>
			logger.warn("customer-export: retrying markCompleted", {
				data: {
					exportId,
					attempt,
					error: error instanceof Error ? error.message : String(error),
				},
			}),
		run: async () => {
			const completed = await CustomerExportService.markCompleted({
				db: ctx.db,
				id: exportId,
				rowCount,
				byteCount,
			});
			if (!completed) {
				logger.warn("customer-export: row left its active state mid-run", {
					data: { exportId },
				});
			}
		},
	});

/** A retry can reconcile an object published before its completion write. */
const reconcileUploadedExport = async ({
	ctx,
	logger,
	customerExport,
	bucket,
	region,
}: {
	ctx: AutumnContext;
	logger: Logger;
	customerExport: DbCustomerExport;
	bucket: string;
	region: string;
}): Promise<boolean> => {
	if (!customerExport.s3_key) return false;

	const head = await headS3Object({
		bucket,
		region,
		key: customerExport.s3_key,
	});
	if (!head.exists) return false;

	await markCompletedWithRetry({
		ctx,
		logger,
		exportId: customerExport.id,
		rowCount: null,
		byteCount: head.contentLength,
	});
	logger.warn(
		"customer-export: reconciled export published before its status write",
		{ data: { exportId: customerExport.id } },
	);
	return true;
};

/** Null means this attempt has nothing to run: reconciled or already resolved. */
const resolveRunnableExport = async ({
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

const uploadCustomerExportCsv = async ({
	ctx,
	logger,
	customerExport,
	payload,
	bucket,
	region,
	key,
	progress,
}: {
	ctx: AutumnContext;
	logger: Logger;
	customerExport: DbCustomerExport;
	payload: RunCustomerExportPayload;
	bucket: string;
	region: string;
	key: string;
	progress?: CustomerExportProgressReporter;
}): Promise<{ rowCount: number; byteCount: number }> => {
	const { exportId, orgId, env } = payload;
	const { snapshot } = customerExport;
	const createdAtCutoff = customerExport.created_at;

	const upperBoundInternalId = await getCustomerExportUpperBound({
		db: ctx.db,
		orgId,
		env,
		snapshot,
		createdAtCutoff,
	});
	const totalCount = await countCustomerExportRows({
		db: ctx.db,
		orgId,
		env,
		snapshot,
		upperBoundInternalId,
		createdAtCutoff,
	});

	await CustomerExportService.markRunning({
		db: ctx.db,
		id: exportId,
		s3Key: key,
	});
	logger.info("customer-export: started", {
		data: { exportId, totalCount },
	});

	// The reporter is absent for inline runs; retries reset before re-walking.
	await progress?.setTotalRows(totalCount);
	await progress?.resetProcessedRows();

	return await streamCustomerExportCsv({
		ctx,
		customerExport,
		orgId,
		env,
		upperBoundInternalId,
		createdAtCutoff,
		bucket,
		region,
		key,
		onRowsProcessed: (processedRows) =>
			progress?.incrementProcessedRows(processedRows),
	});
};

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
	await markCompletedWithRetry({
		ctx,
		logger,
		exportId,
		rowCount: totals.rowCount,
		byteCount: totals.byteCount,
	});
	logger.info("customer-export: completed", {
		data: { exportId, ...totals, fileName: CUSTOMER_EXPORT_FILE_NAME },
	});
};

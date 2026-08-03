import { CustomerExportStatus, type DbCustomerExport } from "@autumn/shared";
import {
	CUSTOMER_EXPORT_FILE_NAME,
	getCustomerExportKey,
	getCustomerExportsS3Config,
} from "@/external/aws/s3/customerExportsS3Config.js";
import { headS3Object } from "@/external/aws/s3/s3ObjectUtils.js";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { RunCustomerExportPayload } from "@/trigger/exports/customerExportTaskPayload.js";
import { CustomerExportService } from "../CustomerExportService.js";
import { getCustomerExportErrorMessage } from "../customerExportErrorMessage.js";
import {
	countCustomerExportRows,
	getCustomerExportUpperBound,
} from "../queries/getCustomerExportScalars.js";
import { streamCustomerExportCsv } from "./streamCustomerExportCsv.js";

const MAX_STORED_ERROR_LENGTH = 500;
const MARK_COMPLETED_ATTEMPTS = 3;
const MARK_COMPLETED_RETRY_DELAY_MS = 2000;

type CustomerExportProgressReporter = {
	setTotalRows: (rowCount: number) => Promise<void> | void;
	resetProcessedRows: () => Promise<void> | void;
	incrementProcessedRows: (rowCount: number) => Promise<void> | void;
};

const sanitizeExportError = ({ error }: { error: unknown }) => {
	const message = getCustomerExportErrorMessage({
		error,
		fallback: "Customer export failed",
	});
	return message.slice(0, MAX_STORED_ERROR_LENGTH);
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
}) => {
	for (let attempt = 1; ; attempt++) {
		try {
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
			return;
		} catch (error) {
			if (attempt >= MARK_COMPLETED_ATTEMPTS) throw error;
			logger.warn("customer-export: retrying markCompleted", {
				data: { exportId, attempt, error: sanitizeExportError({ error }) },
			});
			await new Promise((resolve) =>
				setTimeout(resolve, MARK_COMPLETED_RETRY_DELAY_MS),
			);
		}
	}
};

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
	const customerExport = await CustomerExportService.get({
		db: ctx.db,
		id: exportId,
		orgId,
		env,
	});

	if (!customerExport) {
		throw new Error(`Customer export ${exportId} not found`);
	}

	const { bucket, region } = getCustomerExportsS3Config();
	// Idempotency means only this export's retry sees Running: reconcile or restart.
	if (customerExport.status === CustomerExportStatus.Running) {
		const reconciled = await reconcileUploadedExport({
			ctx,
			logger,
			customerExport,
			bucket,
			region,
		});
		if (reconciled) return;
	} else if (customerExport.status !== CustomerExportStatus.Queued) {
		logger.warn("customer-export: skipping non-active export", {
			data: { exportId, status: customerExport.status },
		});
		return;
	}

	const key = getCustomerExportKey({ orgId, env, exportId });
	// Once published, aborting or failing would orphan a valid downloadable file.
	let uploadPublished = false;

	try {
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

		const { rowCount, byteCount } = await streamCustomerExportCsv({
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
		uploadPublished = true;

		await markCompletedWithRetry({
			ctx,
			logger,
			exportId,
			rowCount,
			byteCount,
		});

		logger.info("customer-export: completed", {
			data: {
				exportId,
				rowCount,
				byteCount,
				fileName: CUSTOMER_EXPORT_FILE_NAME,
			},
		});
	} catch (error) {
		// Keep published exports active so a retry can reconcile their status write.
		if (uploadPublished) throw error;

		// Earlier attempts stay active because the next attempt restarts the upload.
		if (isFinalAttempt) {
			await CustomerExportService.markFailed({
				db: ctx.db,
				id: exportId,
				errorMessage: sanitizeExportError({ error }),
			});
		}

		throw error;
	}
};

import {
	type AppEnv,
	CUSTOMER_EXPORT_PROCESSED_ROWS_KEY,
	CUSTOMER_EXPORT_TOTAL_ROWS_KEY,
	CustomerExportStatus,
	type DbCustomerExport,
} from "@autumn/shared";
import { metadata, task } from "@trigger.dev/sdk/v3";
import {
	CUSTOMER_EXPORT_FILE_NAME,
	getCustomerExportKey,
	getCustomerExportsS3Config,
} from "@/external/aws/s3/customerExportsS3Config.js";
import {
	abortS3MultipartUpload,
	completeS3MultipartUpload,
	createS3MultipartUpload,
	uploadS3Part,
} from "@/external/aws/s3/s3MultipartUtils.js";
import { headS3Object } from "@/external/aws/s3/s3ObjectUtils.js";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusSearchService } from "@/internal/customers/CusSearchService.js";
import { CustomerExportService } from "@/internal/customers/exports/CustomerExportService.js";
import { createCsvUploadBuffer } from "@/internal/customers/exports/csv/csvUploadBuffer.js";
import {
	type CustomerExportRow,
	serializeCustomerExportRows,
} from "@/internal/customers/exports/csv/serializeCustomerExportRows.js";
import {
	emptyPlanColumns,
	getCustomerExportPlanColumns,
} from "@/internal/customers/exports/queries/getCustomerExportPlanColumns.js";
import {
	CUSTOMER_EXPORT_PAGE_SIZE,
	getCustomerExportScalars,
} from "@/internal/customers/exports/queries/getCustomerExportScalars.js";
import { createOneOffProductLookup } from "@/internal/customers/exports/queries/getOneOffProductLookup.js";
import {
	CUSTOMER_EXPORT_MAX_DURATION_SECONDS,
	CUSTOMER_EXPORT_PARENT_RETRY,
	customerExportParentQueue,
} from "@/trigger/exports/customerExportQueue.js";
import {
	type RunCustomerExportPayload,
	RunCustomerExportPayloadSchema,
} from "@/trigger/exports/customerExportTaskPayload.js";
import { createTriggerContext } from "@/trigger/utils/createTriggerContext.js";

const MAX_STORED_ERROR_LENGTH = 500;

/** Job rows are user-visible, so only a short message survives — never a stack. */
const sanitizeExportError = ({ error }: { error: unknown }) => {
	const message =
		error instanceof Error ? error.message : "Customer export failed";
	return message.slice(0, MAX_STORED_ERROR_LENGTH);
};

const MARK_COMPLETED_ATTEMPTS = 3;
const MARK_COMPLETED_RETRY_DELAY_MS = 2000;

/** The CSV is already published here, so a transient DB blip must not fail the export. */
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

const abortUploadBestEffort = async ({
	logger,
	exportId,
	bucket,
	region,
	key,
	uploadId,
}: {
	logger: Logger;
	exportId: string;
	bucket: string;
	region: string;
	key: string;
	uploadId: string;
}) => {
	await abortS3MultipartUpload({ bucket, region, key, uploadId }).catch(
		(error) => {
			logger.error("customer-export: failed to abort multipart upload", {
				data: { exportId, error: sanitizeExportError({ error }) },
			});
		},
	);
};

/** A retry that finds the published object only needs to record completion. */
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
		{
			data: { exportId: customerExport.id },
		},
	);
	return true;
};

const streamCustomerExportCsv = async ({
	ctx,
	customerExport,
	orgId,
	env,
	bucket,
	region,
	key,
	uploadId,
}: {
	ctx: AutumnContext;
	customerExport: DbCustomerExport;
	orgId: string;
	env: AppEnv;
	bucket: string;
	region: string;
	key: string;
	uploadId: string;
}) => {
	const { fields } = customerExport;
	const snapshot = {
		search: customerExport.snapshot?.search ?? "",
		filters: customerExport.snapshot?.filters ?? {},
	};
	const oneOffProductLookup = createOneOffProductLookup({ db: ctx.db });
	const buffer = createCsvUploadBuffer({
		uploadPart: ({ partNumber, body }) =>
			uploadS3Part({ bucket, region, key, uploadId, partNumber, body }),
	});

	await buffer.append(
		serializeCustomerExportRows({ rows: [], fields, includeHeader: true }),
	);

	let rowCount = 0;
	let afterInternalId: string | null = null;

	for (;;) {
		const scalars = await getCustomerExportScalars({
			db: ctx.db,
			orgId,
			env,
			snapshot,
			afterInternalId,
		});
		if (scalars.length === 0) break;

		const planColumnsByCustomer = await getCustomerExportPlanColumns({
			db: ctx.db,
			internalCustomerIds: scalars.map((scalar) => scalar.internal_id),
			oneOffProductLookup,
		});

		const rows: CustomerExportRow[] = scalars.map((scalar) => {
			const planColumns =
				planColumnsByCustomer.get(scalar.internal_id) ?? emptyPlanColumns();

			return {
				name: scalar.name,
				email: scalar.email,
				customer_id: scalar.id,
				subscriptions: planColumns.subscriptions,
				purchases: planColumns.purchases,
				licenses: planColumns.licenses,
			};
		});

		await buffer.append(serializeCustomerExportRows({ rows, fields }));
		rowCount += scalars.length;
		afterInternalId = scalars[scalars.length - 1].internal_id;
		await metadata.increment(
			CUSTOMER_EXPORT_PROCESSED_ROWS_KEY,
			scalars.length,
		);

		if (scalars.length < CUSTOMER_EXPORT_PAGE_SIZE) break;
	}

	const { parts, byteCount } = await buffer.finalize();
	return { rowCount, parts, byteCount };
};

export const executeCustomerExport = async ({
	ctx,
	logger,
	payload,
	isFinalAttempt = true,
}: {
	ctx: AutumnContext;
	logger: Logger;
	payload: RunCustomerExportPayload;
	isFinalAttempt?: boolean;
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

	if (customerExport.status === CustomerExportStatus.Running) {
		// Creates are idempotency-keyed, so only a retry of this export's own run
		// sees Running: reconcile a finished upload, otherwise start over.
		const reconciled = await reconcileUploadedExport({
			ctx,
			logger,
			customerExport,
			bucket,
			region,
		});
		if (reconciled) return;

		if (customerExport.s3_key && customerExport.s3_upload_id) {
			await abortUploadBestEffort({
				logger,
				exportId,
				bucket,
				region,
				key: customerExport.s3_key,
				uploadId: customerExport.s3_upload_id,
			});
		}
	} else if (customerExport.status !== CustomerExportStatus.Queued) {
		logger.warn("customer-export: skipping non-active export", {
			data: { exportId, status: customerExport.status },
		});
		return;
	}

	const key = getCustomerExportKey({ orgId, env, exportId });
	// Only set once the upload exists — nothing to abort before that point.
	let uploadId: string | undefined;
	// Once the multipart upload is completed the CSV is published: aborting or
	// failing the export past this point would orphan a perfectly good file.
	let uploadCompleted = false;

	try {
		const { totalCount } = await CusSearchService.count({
			db: ctx.db,
			orgId,
			env,
			search: customerExport.snapshot?.search ?? "",
			filters: customerExport.snapshot?.filters ?? {},
		});

		uploadId = (
			await createS3MultipartUpload({
				bucket,
				region,
				key,
				contentType: "text/csv; charset=utf-8",
			})
		).uploadId;

		await CustomerExportService.markRunning({
			db: ctx.db,
			id: exportId,
			s3Key: key,
			s3UploadId: uploadId,
		});

		logger.info("customer-export: started", {
			data: { exportId, totalCount },
		});

		// Safe no-ops outside a trigger run (inline dev mode). A restarted attempt
		// re-walks from the top, so the processed counter starts over too.
		metadata.set(CUSTOMER_EXPORT_TOTAL_ROWS_KEY, totalCount);
		metadata.set(CUSTOMER_EXPORT_PROCESSED_ROWS_KEY, 0);

		const { rowCount, parts, byteCount } = await streamCustomerExportCsv({
			ctx,
			customerExport,
			orgId,
			env,
			bucket,
			region,
			key,
			uploadId,
		});

		await completeS3MultipartUpload({ bucket, region, key, uploadId, parts });
		uploadCompleted = true;

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
				partCount: parts.length,
				fileName: CUSTOMER_EXPORT_FILE_NAME,
			},
		});
	} catch (error) {
		// The CSV is already published: keep the row active so a retry can
		// reconcile it instead of failing a downloadable export.
		if (uploadCompleted) throw error;

		if (uploadId) {
			await abortUploadBestEffort({
				logger,
				exportId,
				bucket,
				region,
				key,
				uploadId,
			});
		}

		// Earlier attempts leave the row running; the retry restarts from scratch.
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

export const customerExportTask = task({
	id: "customer-export",
	queue: customerExportParentQueue,
	retry: CUSTOMER_EXPORT_PARENT_RETRY,
	machine: "medium-1x",
	maxDuration: CUSTOMER_EXPORT_MAX_DURATION_SECONDS,
	run: async (rawPayload: unknown, { ctx: triggerCtx }) => {
		const payload = RunCustomerExportPayloadSchema.parse(rawPayload);

		const { ctx, logger } = await createTriggerContext({
			orgId: payload.orgId,
			env: payload.env,
			triggerCtx,
		});

		await executeCustomerExport({
			ctx,
			logger,
			payload,
			isFinalAttempt:
				triggerCtx.attempt.number >= CUSTOMER_EXPORT_PARENT_RETRY.maxAttempts,
		});
	},
});

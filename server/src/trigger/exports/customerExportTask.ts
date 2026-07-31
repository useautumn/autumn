import { CustomerExportStatus } from "@autumn/shared";
import { task } from "@trigger.dev/sdk/v3";
import {
	CUSTOMER_EXPORT_FILE_NAME,
	getCustomerExportKey,
	getCustomerExportsS3Config,
} from "@/external/aws/s3/customerExportsS3Config.js";
import {
	abortS3MultipartUpload,
	completeS3MultipartUpload,
	createS3MultipartUpload,
	type S3UploadedPart,
	uploadS3Part,
} from "@/external/aws/s3/s3MultipartUtils.js";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CustomerExportService } from "@/internal/customers/exports/CustomerExportService.js";
import { serializeCustomerExportRows } from "@/internal/customers/exports/csv/serializeCustomerExportRows.js";
import {
	getCustomerExportPartitions,
	resolveRowsPerWorker,
} from "@/internal/customers/exports/queries/getCustomerExportPartitions.js";
import {
	CUSTOMER_EXPORT_MAX_DURATION_SECONDS,
	CUSTOMER_EXPORT_PARENT_RETRY,
	customerExportParentQueue,
} from "@/trigger/exports/customerExportQueue.js";
import {
	type CustomerExportWorkerResult,
	type RunCustomerExportPayload,
	RunCustomerExportPayloadSchema,
	type RunCustomerExportWorkerPayload,
} from "@/trigger/exports/customerExportTaskPayload.js";
import {
	customerExportWorkerTask,
	executeCustomerExportWorker,
} from "@/trigger/exports/customerExportWorkerTask.js";
import { createTriggerContext } from "@/trigger/utils/createTriggerContext.js";

const MAX_STORED_ERROR_LENGTH = 500;

export type CustomerExportWorkerRunner = (
	payloads: RunCustomerExportWorkerPayload[],
) => Promise<CustomerExportWorkerResult[]>;

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
	rowCount: number;
	byteCount: number;
}) => {
	for (let attempt = 1; ; attempt++) {
		try {
			await CustomerExportService.markCompleted({
				db: ctx.db,
				id: exportId,
				rowCount,
				byteCount,
			});
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

const runWorkersInline = async ({
	ctx,
	logger,
	payloads,
}: {
	ctx: AutumnContext;
	logger: Logger;
	payloads: RunCustomerExportWorkerPayload[];
}) => {
	const results: CustomerExportWorkerResult[] = [];
	for (const payload of payloads) {
		results.push(await executeCustomerExportWorker({ ctx, logger, payload }));
	}
	return results;
};

export const executeCustomerExport = async ({
	ctx,
	logger,
	payload,
	runWorkers,
}: {
	ctx: AutumnContext;
	logger: Logger;
	payload: RunCustomerExportPayload;
	runWorkers?: CustomerExportWorkerRunner;
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
	if (customerExport.status !== CustomerExportStatus.Queued) {
		logger.warn("customer-export: skipping non-queued export", {
			data: { exportId, status: customerExport.status },
		});
		return;
	}

	const { bucket, region } = getCustomerExportsS3Config();
	const key = getCustomerExportKey({ orgId, env, exportId });
	// Only set once the upload exists — nothing to abort before that point.
	let uploadId: string | undefined;
	// Once the multipart upload is completed the CSV is published: aborting or
	// failing the export past this point would orphan a perfectly good file.
	let uploadCompleted = false;

	try {
		const rowsPerWorker = resolveRowsPerWorker({
			fieldCount: customerExport.fields.length,
		});
		const { partitions, totalRows } = await getCustomerExportPartitions({
			db: ctx.db,
			orgId,
			env,
			snapshot: customerExport.snapshot,
			rowsPerWorker,
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
			partitionPlan: { rowsPerWorker, partitions },
		});

		logger.info("customer-export: partitioned", {
			data: { exportId, totalRows, partitionCount: partitions.length },
		});

		const parts = await uploadCustomerExportParts({
			ctx,
			logger,
			customerExportFields: customerExport.fields,
			payload,
			partitions,
			bucket,
			region,
			key,
			uploadId,
			snapshot: customerExport.snapshot,
			runWorkers,
		});

		await completeS3MultipartUpload({
			bucket,
			region,
			key,
			uploadId,
			parts: parts.map(({ partNumber, eTag }) => ({ partNumber, eTag })),
		});
		uploadCompleted = true;

		await markCompletedWithRetry({
			ctx,
			logger,
			exportId,
			rowCount: parts.reduce((total, part) => total + part.rowCount, 0),
			byteCount: parts.reduce((total, part) => total + part.byteCount, 0),
		});

		logger.info("customer-export: completed", {
			data: { exportId, fileName: CUSTOMER_EXPORT_FILE_NAME },
		});
	} catch (error) {
		// The CSV already exists; leave the row active so status can be reconciled
		// instead of failing a downloadable export.
		if (uploadCompleted) throw error;

		if (uploadId) {
			await abortS3MultipartUpload({ bucket, region, key, uploadId }).catch(
				(abortError) => {
					logger.error("customer-export: failed to abort multipart upload", {
						data: {
							exportId,
							error: sanitizeExportError({ error: abortError }),
						},
					});
				},
			);
		}

		await CustomerExportService.markFailed({
			db: ctx.db,
			id: exportId,
			errorMessage: sanitizeExportError({ error }),
		});

		throw error;
	}
};

const uploadCustomerExportParts = async ({
	ctx,
	logger,
	customerExportFields,
	payload,
	partitions,
	bucket,
	region,
	key,
	uploadId,
	snapshot,
	runWorkers,
}: {
	ctx: AutumnContext;
	logger: Logger;
	customerExportFields: RunCustomerExportWorkerPayload["fields"];
	payload: RunCustomerExportPayload;
	partitions: Array<{
		partNumber: number;
		upperInternalId: string | null;
		lowerInternalId: string | null;
	}>;
	bucket: string;
	region: string;
	key: string;
	uploadId: string;
	snapshot: RunCustomerExportWorkerPayload["snapshot"];
	runWorkers?: CustomerExportWorkerRunner;
}): Promise<CustomerExportWorkerResult[]> => {
	// No matching customers: the parent writes the header-only object itself.
	if (partitions.length === 0) {
		const body = new TextEncoder().encode(
			serializeCustomerExportRows({
				rows: [],
				fields: customerExportFields,
				includeHeader: true,
			}),
		);
		const part: S3UploadedPart = await uploadS3Part({
			bucket,
			region,
			key,
			uploadId,
			partNumber: 1,
			body,
		});

		return [{ ...part, rowCount: 0, byteCount: body.byteLength }];
	}

	const workerPayloads: RunCustomerExportWorkerPayload[] = partitions.map(
		(partition) => ({
			exportId: payload.exportId,
			orgId: payload.orgId,
			env: payload.env,
			range: partition,
			includeHeader: partition.partNumber === 1,
			fields: customerExportFields,
			snapshot,
			s3Key: key,
			s3UploadId: uploadId,
		}),
	);

	if (runWorkers) return await runWorkers(workerPayloads);

	return await runWorkersInline({ ctx, logger, payloads: workerPayloads });
};

const runWorkersViaTrigger: CustomerExportWorkerRunner = async (payloads) => {
	const batch = await customerExportWorkerTask.batchTriggerAndWait(
		payloads.map((workerPayload) => ({
			payload: workerPayload,
			options: {
				idempotencyKey: `customer-export-part:${workerPayload.exportId}:${workerPayload.range.partNumber}`,
				idempotencyKeyTTL: "7d",
			},
		})),
	);

	return batch.runs.map((run, index) => {
		if (!run.ok) {
			throw new Error(
				`Customer export part ${payloads[index].range.partNumber} failed: ${run.error instanceof Error ? run.error.message : String(run.error)}`,
			);
		}
		return run.output as CustomerExportWorkerResult;
	});
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
			runWorkers: runWorkersViaTrigger,
		});
	},
});

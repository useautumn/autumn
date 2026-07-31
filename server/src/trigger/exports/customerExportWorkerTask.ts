import { metadata, task } from "@trigger.dev/sdk/v3";
import { getCustomerExportsS3Config } from "@/external/aws/s3/customerExportsS3Config.js";
import { uploadS3Part } from "@/external/aws/s3/s3MultipartUtils.js";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	type CustomerExportRow,
	serializeCustomerExportRows,
} from "@/internal/customers/exports/csv/serializeCustomerExportRows.js";
import { CUSTOMER_EXPORT_PROCESSED_ROWS_KEY } from "@/internal/customers/exports/customerExportProgress.js";
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
	CUSTOMER_EXPORT_WORKER_RETRY,
	customerExportWorkerQueue,
} from "@/trigger/exports/customerExportQueue.js";
import {
	type CustomerExportWorkerResult,
	type RunCustomerExportWorkerPayload,
	RunCustomerExportWorkerPayloadSchema,
} from "@/trigger/exports/customerExportTaskPayload.js";
import { createTriggerContext } from "@/trigger/utils/createTriggerContext.js";

/** Serializes the worker's whole range in memory and uploads it as its ONE part. */
export const executeCustomerExportWorker = async ({
	ctx,
	logger,
	payload,
}: {
	ctx: AutumnContext;
	logger: Logger;
	payload: RunCustomerExportWorkerPayload;
}): Promise<CustomerExportWorkerResult> => {
	const { exportId, orgId, env, range, fields, snapshot } = payload;
	const partNumber = range.partNumber;
	const oneOffProductLookup = createOneOffProductLookup({ db: ctx.db });

	const csvChunks: string[] = [];
	let rowCount = 0;
	let afterInternalId: string | null = null;
	let includeHeader = payload.includeHeader;

	for (;;) {
		const scalars = await getCustomerExportScalars({
			db: ctx.db,
			orgId,
			env,
			snapshot,
			upperInternalId: range.upperInternalId,
			lowerInternalId: range.lowerInternalId,
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

		csvChunks.push(
			serializeCustomerExportRows({ rows, fields, includeHeader }),
		);
		includeHeader = false;
		rowCount += scalars.length;
		afterInternalId = scalars[scalars.length - 1].internal_id;
		// The parent run owns the counter; safe no-op outside a trigger run.
		metadata.root.increment(CUSTOMER_EXPORT_PROCESSED_ROWS_KEY, scalars.length);

		if (scalars.length < CUSTOMER_EXPORT_PAGE_SIZE) break;
	}

	// The header owner still emits BOM + header when its range turned up empty.
	if (payload.includeHeader && rowCount === 0) {
		csvChunks.push(
			serializeCustomerExportRows({ rows: [], fields, includeHeader: true }),
		);
	}

	const body = new TextEncoder().encode(csvChunks.join(""));
	const { bucket, region } = getCustomerExportsS3Config();

	const { eTag } = await uploadS3Part({
		bucket,
		region,
		key: payload.s3Key,
		uploadId: payload.s3UploadId,
		partNumber,
		body,
	});

	logger.info("customer-export-worker: part uploaded", {
		data: { exportId, partNumber, rowCount, byteCount: body.byteLength },
	});

	return { partNumber, eTag, rowCount, byteCount: body.byteLength };
};

export const customerExportWorkerTask = task({
	id: "customer-export-worker",
	queue: customerExportWorkerQueue,
	retry: CUSTOMER_EXPORT_WORKER_RETRY,
	machine: "medium-1x",
	maxDuration: CUSTOMER_EXPORT_MAX_DURATION_SECONDS,
	run: async (rawPayload: unknown, { ctx: triggerCtx }) => {
		const payload = RunCustomerExportWorkerPayloadSchema.parse(rawPayload);

		const { ctx, logger } = await createTriggerContext({
			orgId: payload.orgId,
			env: payload.env,
			triggerCtx,
		});

		return await executeCustomerExportWorker({ ctx, logger, payload });
	},
});

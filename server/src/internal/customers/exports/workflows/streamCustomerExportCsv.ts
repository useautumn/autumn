import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { AppEnv, DbCustomerExport } from "@autumn/shared";
import { Upload } from "@aws-sdk/lib-storage";
import { getS3Client } from "@/external/aws/s3/initS3.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	type CustomerExportRow,
	createCustomerExportStringifier,
} from "../csv/createCustomerExportStringifier.js";
import {
	emptyPlanColumns,
	getCustomerExportPlanColumns,
} from "../queries/getCustomerExportPlanColumns.js";
import {
	CUSTOMER_EXPORT_PAGE_SIZE,
	getCustomerExportScalars,
} from "../queries/getCustomerExportScalars.js";
import { createOneOffProductLookup } from "../queries/getOneOffProductLookup.js";

const CSV_UPLOAD_PART_SIZE_BYTES = 8 * 1024 * 1024;

export const streamCustomerExportCsv = async ({
	ctx,
	customerExport,
	orgId,
	env,
	upperBoundInternalId,
	createdAtCutoff,
	bucket,
	region,
	key,
	onRowsProcessed,
}: {
	ctx: AutumnContext;
	customerExport: DbCustomerExport;
	orgId: string;
	env: AppEnv;
	upperBoundInternalId: string | null;
	createdAtCutoff: number;
	bucket: string;
	region: string;
	key: string;
	onRowsProcessed?: (rowCount: number) => Promise<void> | void;
}) => {
	const { fields, snapshot } = customerExport;
	const oneOffProductLookup = createOneOffProductLookup({ db: ctx.db });
	let rowCount = 0;
	let byteCount = 0;

	const exportRows = async function* (): AsyncGenerator<CustomerExportRow> {
		let afterInternalId: string | null = null;
		let hasMorePages = true;

		while (hasMorePages) {
			const scalars = await getCustomerExportScalars({
				db: ctx.db,
				orgId,
				env,
				snapshot,
				upperBoundInternalId,
				createdAtCutoff,
				afterInternalId,
			});
			const lastScalar = scalars[scalars.length - 1];
			if (!lastScalar) break;

			const planColumnsByCustomer = await getCustomerExportPlanColumns({
				db: ctx.db,
				internalCustomerIds: scalars.map((scalar) => scalar.internal_id),
				oneOffProductLookup,
			});

			for (const scalar of scalars) {
				const planColumns =
					planColumnsByCustomer.get(scalar.internal_id) ?? emptyPlanColumns();
				yield {
					name: scalar.name,
					email: scalar.email,
					customer_id: scalar.id,
					subscriptions: planColumns.subscriptions,
					purchases: planColumns.purchases,
					licenses: planColumns.licenses,
				};
			}

			rowCount += scalars.length;
			await onRowsProcessed?.(scalars.length);

			afterInternalId = lastScalar.internal_id;
			hasMorePages = scalars.length === CUSTOMER_EXPORT_PAGE_SIZE;
		}
	};

	// A paused-mode Transform counts bytes; a "data" listener would starve Upload.
	const countedCsvBytes = new Transform({
		transform(chunk, _encoding, callback) {
			const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
			byteCount += bytes.byteLength;
			callback(null, bytes);
		},
	});

	const csvPipeline = pipeline(
		Readable.from(exportRows(), { objectMode: true }),
		createCustomerExportStringifier({ fields }),
		countedCsvBytes,
	);

	const upload = new Upload({
		client: getS3Client({ region }),
		params: {
			Bucket: bucket,
			Key: key,
			Body: countedCsvBytes,
			ContentType: "text/csv; charset=utf-8",
		},
		partSize: CSV_UPLOAD_PART_SIZE_BYTES,
		queueSize: 1,
	});

	await Promise.all([
		csvPipeline,
		upload.done().catch((error: unknown) => {
			// Tear the pipeline down so a dead upload can't leave it awaiting drain.
			countedCsvBytes.destroy(
				error instanceof Error ? error : new Error(String(error)),
			);
			throw error;
		}),
	]);

	return { rowCount, byteCount };
};

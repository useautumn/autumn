import { Readable } from "node:stream";
import type { AppEnv, DbCustomerExport } from "@autumn/shared";
import { Upload } from "@aws-sdk/lib-storage";
import { getS3Client } from "@/external/aws/s3/initS3.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	CSV_ROW_SEPARATOR,
	serializeCustomerExportRow,
	serializeCustomerExportRows,
} from "../csv/serializeCustomerExportRows.js";
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
	const encoder = new TextEncoder();

	const csvChunks = async function* () {
		const header = encoder.encode(
			serializeCustomerExportRows({ rows: [], fields, includeHeader: true }),
		);
		byteCount += header.byteLength;
		yield header;

		let afterInternalId: string | null = null;
		for (;;) {
			const scalars = await getCustomerExportScalars({
				db: ctx.db,
				orgId,
				env,
				snapshot,
				upperBoundInternalId,
				createdAtCutoff,
				afterInternalId,
			});
			if (scalars.length === 0) break;

			const planColumnsByCustomer = await getCustomerExportPlanColumns({
				db: ctx.db,
				internalCustomerIds: scalars.map((scalar) => scalar.internal_id),
				oneOffProductLookup,
			});

			let lastInternalId: string | null = null;
			for (const scalar of scalars) {
				const planColumns =
					planColumnsByCustomer.get(scalar.internal_id) ?? emptyPlanColumns();
				const csvRow = serializeCustomerExportRow({
					fields,
					row: {
						name: scalar.name,
						email: scalar.email,
						customer_id: scalar.id,
						subscriptions: planColumns.subscriptions,
						purchases: planColumns.purchases,
						licenses: planColumns.licenses,
					},
				});
				const chunk = encoder.encode(`${csvRow}${CSV_ROW_SEPARATOR}`);
				byteCount += chunk.byteLength;
				yield chunk;
				lastInternalId = scalar.internal_id;
			}

			rowCount += scalars.length;
			await onRowsProcessed?.(scalars.length);

			if (!lastInternalId || scalars.length < CUSTOMER_EXPORT_PAGE_SIZE) break;
			afterInternalId = lastInternalId;
		}
	};

	// Upload owns multipart chunking, retries, completion, and abort-on-error.
	const upload = new Upload({
		client: getS3Client({ region }),
		params: {
			Bucket: bucket,
			Key: key,
			Body: Readable.from(csvChunks(), { objectMode: false }),
			ContentType: "text/csv; charset=utf-8",
		},
		partSize: CSV_UPLOAD_PART_SIZE_BYTES,
		queueSize: 1,
	});

	await upload.done();
	return { rowCount, byteCount };
};

import type { Readable } from "node:stream";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { CustomerExportField } from "@autumn/shared";
import { Upload } from "@aws-sdk/lib-storage";
import type { CustomerExportDestination } from "@/external/aws/s3/customerExportsS3Config.js";
import { getS3Client } from "@/external/aws/s3/initS3.js";
import { createCustomerExportStringifier } from "../csv/createCustomerExportStringifier.js";

const CSV_UPLOAD_PART_SIZE_BYTES = 8 * 1024 * 1024;

export const uploadCustomerExportCsvStream = async ({
	rows,
	fields,
	destination,
}: {
	rows: Readable;
	fields: CustomerExportField[];
	destination: CustomerExportDestination;
}): Promise<{ byteCount: number }> => {
	const { bucket, region, key } = destination;
	let byteCount = 0;

	// A paused-mode Transform counts bytes; a "data" listener would starve Upload.
	const countedCsvBytes = new Transform({
		transform(chunk, _encoding, callback) {
			const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
			byteCount += bytes.byteLength;
			callback(null, bytes);
		},
	});

	const csvPipeline = pipeline(
		rows,
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

	return { byteCount };
};

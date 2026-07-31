import type { S3UploadedPart } from "@/external/aws/s3/s3MultipartUtils.js";

// Above S3's 5 MiB non-final part minimum with margin, so every flushed part is
// valid and worker memory stays bounded regardless of export size.
export const CSV_UPLOAD_FLUSH_BYTES = 8 * 1024 * 1024;

export type UploadCsvPart = (args: {
	partNumber: number;
	body: Uint8Array;
}) => Promise<S3UploadedPart>;

const concatChunks = ({
	chunks,
	totalBytes,
}: {
	chunks: Uint8Array[];
	totalBytes: number;
}) => {
	const merged = new Uint8Array(totalBytes);
	let offset = 0;
	for (const chunk of chunks) {
		merged.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return merged;
};

/**
 * Accumulates CSV text and uploads sequential parts once the buffer clears
 * CSV_UPLOAD_FLUSH_BYTES; only the part uploaded by finalize may be smaller.
 */
export const createCsvUploadBuffer = ({
	uploadPart,
	flushBytes = CSV_UPLOAD_FLUSH_BYTES,
}: {
	uploadPart: UploadCsvPart;
	flushBytes?: number;
}) => {
	const encoder = new TextEncoder();
	const pendingChunks: Uint8Array[] = [];
	let pendingBytes = 0;
	let nextPartNumber = 1;
	const uploadedParts: S3UploadedPart[] = [];
	let totalBytes = 0;

	const flush = async () => {
		if (pendingBytes === 0) return;
		const body = concatChunks({
			chunks: pendingChunks,
			totalBytes: pendingBytes,
		});
		pendingChunks.length = 0;
		pendingBytes = 0;
		const part = await uploadPart({ partNumber: nextPartNumber, body });
		nextPartNumber += 1;
		uploadedParts.push(part);
		totalBytes += body.byteLength;
	};

	return {
		append: async (csvText: string) => {
			if (csvText.length === 0) return;
			const chunk = encoder.encode(csvText);
			pendingChunks.push(chunk);
			pendingBytes += chunk.byteLength;
			if (pendingBytes >= flushBytes) await flush();
		},
		finalize: async (): Promise<{
			parts: S3UploadedPart[];
			byteCount: number;
		}> => {
			await flush();
			return { parts: uploadedParts, byteCount: totalBytes };
		},
	};
};

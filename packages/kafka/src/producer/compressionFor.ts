import { CompressionTypes } from "kafkajs";

/** Below this many records per partition batch, gzip costs more CPU than it saves (about 160 µs a record alone, 40 at four). */
export const GZIP_MIN_RECORDS_PER_BATCH = 8;

/** Gzip pays for itself only on batches large enough to share its fixed cost; smaller ones go uncompressed. */
export function compressionFor({
	records,
	partitions = 1,
}: {
	records: number;
	/** The send spreads its records over this many partition batches, each compressed on its own. */
	partitions?: number;
}): CompressionTypes {
	return records / Math.max(1, partitions) >= GZIP_MIN_RECORDS_PER_BATCH
		? CompressionTypes.GZIP
		: CompressionTypes.None;
}

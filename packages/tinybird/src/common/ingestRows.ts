import type { IngestResult } from "@tinybirdco/sdk";
import type { TinybirdClient } from "../types/tinybirdClient.js";
import { TinybirdIngestError } from "./tinybirdIngestError.js";

const MAX_RETRIES = 3;

/**
 * Sends the rows in order, `rowsPerRequest` at a time, each reply coming after its rows are written.
 * Throws a TinybirdIngestError on the first request Tinybird does not take, counting the rows before it that landed.
 */
export const ingestRows = async ({
	ctx,
	datasource,
	rows,
	rowsPerRequest,
}: {
	ctx: { tinybird: TinybirdClient };
	datasource: string;
	rows: Record<string, unknown>[];
	rowsPerRequest: number;
}): Promise<IngestResult> => {
	const total: IngestResult = { successful_rows: 0, quarantined_rows: 0 };
	for (let start = 0; start < rows.length; start += rowsPerRequest) {
		let reply: IngestResult;
		try {
			reply = await ctx.tinybird.api.ingestBatch(
				datasource,
				rows.slice(start, start + rowsPerRequest),
				{ wait: true, maxRetries: MAX_RETRIES },
			);
		} catch (cause) {
			throw new TinybirdIngestError({ writtenRows: start, cause });
		}
		total.successful_rows += reply.successful_rows;
		total.quarantined_rows += reply.quarantined_rows;
	}
	return total;
};

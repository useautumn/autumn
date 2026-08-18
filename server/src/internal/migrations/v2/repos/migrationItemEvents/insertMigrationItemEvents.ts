import type { RepoContext } from "@/db/repoContext.js";
import type { TinybirdMigrationItemEvent } from "@/external/tinybird/migrations/migrationItemEventsDataSource.js";
import { migrationTinybird } from "@/external/tinybird/migrations/migrationItemEventsDataSource.js";

const TINYBIRD_MIGRATION_ITEM_EVENT_MAX_RETRIES = 2;

/** Parallel chunked POSTs: one 5k-row batch is a single multi-second upload
 * even gzipped, while ~1k-row chunks overlap the round trips. */
const TINYBIRD_MIGRATION_ITEM_EVENT_CHUNK_ROWS = 1000;

export const insertMigrationItemEvents = async ({
	ctx,
	events,
}: {
	ctx: RepoContext;
	events: TinybirdMigrationItemEvent[];
}): Promise<void> => {
	if (events.length === 0) return;

	if (!migrationTinybird) {
		ctx.logger.debug("Tinybird not configured, skipping migration item events");
		return;
	}

	const chunks: TinybirdMigrationItemEvent[][] = [];
	for (
		let i = 0;
		i < events.length;
		i += TINYBIRD_MIGRATION_ITEM_EVENT_CHUNK_ROWS
	)
		chunks.push(events.slice(i, i + TINYBIRD_MIGRATION_ITEM_EVENT_CHUNK_ROWS));

	try {
		const results = await Promise.all(
			chunks.map((chunk) =>
				migrationTinybird!.itemEvents.ingestBatch(chunk, {
					wait: false,
					maxRetries: TINYBIRD_MIGRATION_ITEM_EVENT_MAX_RETRIES,
				}),
			),
		);
		const result = results.reduce(
			(acc, r) => ({
				successful_rows: acc.successful_rows + r.successful_rows,
				quarantined_rows: acc.quarantined_rows + r.quarantined_rows,
			}),
			{ successful_rows: 0, quarantined_rows: 0 },
		);
		ctx.logger.info(`Sent ${events.length} migration item events to Tinybird`, {
			data: {
				eventCount: events.length,
				successfulRows: result.successful_rows,
				quarantinedRows: result.quarantined_rows,
			},
		});
	} catch (error) {
		ctx.logger.error("Failed to send migration item events to Tinybird", {
			data: {
				eventCount: events.length,
				error: error instanceof Error ? error.message : String(error),
			},
		});
	}
};

export const insertMigrationItemEvent = async ({
	ctx,
	event,
}: {
	ctx: RepoContext;
	event: TinybirdMigrationItemEvent;
}) => insertMigrationItemEvents({ ctx, events: [event] });

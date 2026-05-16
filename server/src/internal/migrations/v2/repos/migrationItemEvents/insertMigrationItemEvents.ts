import type { RepoContext } from "@/db/repoContext.js";
import type { TinybirdMigrationItemEvent } from "@/external/tinybird/migrations/migrationItemEventsDataSource.js";
import { migrationTinybird } from "@/external/tinybird/migrations/migrationItemEventsDataSource.js";

const TINYBIRD_MIGRATION_ITEM_EVENT_MAX_RETRIES = 2;

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

	try {
		const result = await migrationTinybird.itemEvents.ingestBatch(events, {
			wait: false,
			maxRetries: TINYBIRD_MIGRATION_ITEM_EVENT_MAX_RETRIES,
		});
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

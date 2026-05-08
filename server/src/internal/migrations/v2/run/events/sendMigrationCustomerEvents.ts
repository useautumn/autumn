import * as crypto from "node:crypto";
import * as Sentry from "@sentry/bun";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import {
	isMigrationCustomerEventsTinybirdConfigured,
	migrationCustomerEventsTinybird,
} from "@/external/tinybird/migrationCustomerEventsTinybird.js";
import { mapMigrationCustomerEvent } from "./mapMigrationCustomerEvent.js";
import type { MigrationCustomerEvent } from "./migrationCustomerEventTypes.js";

/**
 * Best-effort Tinybird ingest for migration audit events.
 * Migration execution must not depend on analytics availability.
 */
export const sendMigrationCustomerEventsToTinybird = async ({
	events,
	logger,
}: {
	events: MigrationCustomerEvent[];
	logger: Logger;
}): Promise<void> => {
	if (events.length === 0) return;

	if (
		!isMigrationCustomerEventsTinybirdConfigured() ||
		!migrationCustomerEventsTinybird
	) {
		logger.debug("Tinybird not configured, skipping migration event send");
		return;
	}

	try {
		const tinybirdEvents = events.map((event) =>
			mapMigrationCustomerEvent({ event }),
		);
		const result = await migrationCustomerEventsTinybird.ingestBatch(
			"migration_customer_events",
			tinybirdEvents,
			{
				wait: true,
				maxRetries: 10,
			},
		);
		logger.info(`Sent ${events.length} migration events to Tinybird`, {
			data: {
				eventCount: events.length,
				successfulRows: result.successful_rows,
				quarantinedRows: result.quarantined_rows,
			},
		});
	} catch (error) {
		const errorId = `TB_MIG_ERR_${crypto.randomBytes(8).toString("hex").toUpperCase()}`;
		const errorMessage = error instanceof Error ? error.message : String(error);

		logger.error(`[${errorId}] Failed to send migration events to Tinybird`, {
			data: {
				errorId,
				eventCount: events.length,
				error: errorMessage,
			},
		});

		Sentry.captureException(error, {
			tags: {
				errorId,
				service: "tinybird",
				area: "migration_customer_events",
			},
			extra: {
				data: {
					eventCount: events.length,
				},
			},
		});
	}
};

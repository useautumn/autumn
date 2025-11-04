import { events } from "@autumn/shared";
import type { Logger } from "pino";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { JobName } from "@/queue/JobName.js";
import type { Payloads } from "@/queue/queueUtils.js";

type InsertEventBatchPayload = Payloads[typeof JobName.InsertEventBatch];

/**
 * Worker function to batch insert track events into the database
 * Events are already fully constructed with internal IDs from Redis cache
 */
export const runInsertEventBatch = async ({
	db,
	payload,
	logger,
}: {
	db: DrizzleCli;
	payload: InsertEventBatchPayload;
	logger: Logger;
}) => {
	const { events: eventInserts } = payload;

	if (!eventInserts || eventInserts.length === 0) {
		return;
	}

	// Batch insert events directly - no DB lookups needed
	try {
		await db.insert(events).values(eventInserts as any);
		logger.info(`✅ Successfully inserted ${eventInserts.length} events`);
	} catch (error: any) {
		logger.error(`❌ Failed to batch insert events: ${error.message}`);
		throw error;
	}
};

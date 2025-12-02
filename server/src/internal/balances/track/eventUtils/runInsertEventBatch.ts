import { events } from "@autumn/shared";
import * as Sentry from "@sentry/bun";
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

	if (!eventInserts || eventInserts.length === 0) return;

	// Normalize timestamps
	eventInserts.forEach((event) => {
		try {
			if (event.timestamp && typeof event.timestamp === "string") {
				event.timestamp = new Date(event.timestamp);
			}
		} catch {
			event.timestamp = new Date();
		}
	});

	// Group events by internal_customer_id
	const eventsByCustomer = new Map<string, typeof eventInserts>();
	for (const event of eventInserts) {
		const customerId = event.internal_customer_id;
		if (!customerId) {
			logger.warn(
				"Event missing internal_customer_id, skipping event grouping",
			);
			continue;
		}
		if (!eventsByCustomer.has(customerId)) {
			eventsByCustomer.set(customerId, []);
		}
		eventsByCustomer.get(customerId)?.push(event);
	}

	// Insert events for each customer in parallel
	const insertPromises = Array.from(eventsByCustomer.entries()).map(
		async ([customerId, customerEvents]) => {
			try {
				await db.insert(events).values(customerEvents as any);
				return {
					success: true,
					customerId,
					count: customerEvents.length,
				};
			} catch (error: any) {
				logger.error(
					`❌ Failed to insert ${customerEvents.length} events for customer ${customerId}: ${error.message}`,
				);
				Sentry.captureException(error);
				return {
					success: false,
					customerId,
					count: customerEvents.length,
					error: error.message,
				};
			}
		},
	);

	await Promise.all(insertPromises);
};

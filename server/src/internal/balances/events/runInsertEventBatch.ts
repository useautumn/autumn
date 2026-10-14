import { tryCatch } from "@autumn/shared";
import type { Logger } from "pino";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { neonEventsDb } from "@/db/initNeonEvents.js";
import { EventService } from "@/internal/api/events/EventService.js";
import type { JobName } from "@/queue/JobName.js";
import type { Payloads } from "@/queue/queueUtils.js";

type InsertEventBatchPayload = Payloads[typeof JobName.InsertEventBatch];

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

	eventInserts.forEach((event) => {
		try {
			if (event.timestamp && typeof event.timestamp === "string") {
				event.timestamp = new Date(event.timestamp);
			}
		} catch {
			event.timestamp = new Date();
		}
	});

	logger.debug(`Inserting ${eventInserts.length} events`);

	const eventsDb =
		neonEventsDb ?? (process.env.NODE_ENV === "development" ? db : null);
	if (!eventsDb) return;

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

	const insertPromises = Array.from(eventsByCustomer.entries()).map(
		async ([customerId, customerEvents]) => {
			const { error } = await tryCatch(
				EventService.insert({ db: eventsDb, event: customerEvents, logger }),
			);

			if (error) {
				logger.error(
					{ error },
					`❌ Failed to insert ${customerEvents.length} events for customer ${customerId}: ${error.message}`,
				);
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

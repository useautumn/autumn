import type { EventInsert } from "@autumn/shared";
import { logger } from "@server/external/logtail/logtailUtils.js";
import { sendEventsToTinybird } from "@server/external/tinybird/sendEvents/sendEvents.js";
import { JobName } from "@server/queue/JobName.js";
import { addTaskToQueue } from "@server/queue/queueUtils.js";

class BatchingManager {
	private events: Map<string, EventInsert> = new Map();
	private timer: NodeJS.Timeout | null = null;
	private readonly batchWindow = 350; // 100ms batching window
	private readonly maxBatchSize = 200; // Max events per batch (~200kb per event, keep batches under 10MB for Tinybird)

	/** Add an event to the batch */
	addEvent(event: EventInsert): void {
		const key = event.id;
		this.events.set(key, event);

		// Auto-execute if batch size is reached
		if (this.events.size >= this.maxBatchSize) {
			this.executeBatch();
			return;
		}

		// Start/reset timer for batch execution
		if (this.timer) {
			clearTimeout(this.timer);
		}

		this.timer = setTimeout(() => {
			this.executeBatch();
		}, this.batchWindow);
	}

	/** Execute the current batch - queue to SQS for Postgres and send to Tinybird */
	private async executeBatch(): Promise<void> {
		if (this.timer) {
			clearTimeout(this.timer);
			this.timer = null;
		}

		if (this.events.size === 0) {
			return;
		}

		// Snapshot current batch
		const currentEvents = new Map(this.events);
		this.events.clear();

		const eventItems = Array.from(currentEvents.values());

		// Queue to SQS for Postgres and publish to Tinybird in parallel
		await Promise.all([
			addTaskToQueue({
				jobName: JobName.InsertEventBatch,
				payload: { events: eventItems },
			}).catch((error) => {
				logger.error(
					{ error, eventCount: eventItems.length },
					"Failed to queue event batch to SQS",
				);
			}),
			sendEventsToTinybird({
				events: eventItems,
				logger,
			}),
		]);
	}
}

// Global singleton instance
export const globalEventBatchingManager = new BatchingManager();

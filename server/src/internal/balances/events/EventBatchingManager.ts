import type { EventInsert } from "@autumn/shared";
import { logger } from "@server/external/logtail/logtailUtils.js";
import { sendEventsToTinybird } from "@server/external/tinybird/sendEvents/sendEvents.js";
import { JobName } from "@server/queue/JobName.js";
import { addTaskToQueue } from "@server/queue/queueUtils.js";

class BatchingManager {
	private events: Map<string, EventInsert> = new Map();
	private timer: NodeJS.Timeout | null = null;
	private inFlightBatches = new Set<Promise<void>>();
	private readonly batchWindow = 350;
	private readonly maxBatchSize = 200; // Max events per batch (~200kb per event, keep batches under 10MB for Tinybird)

	addEvent(event: EventInsert): void {
		const key = event.id;
		this.events.set(key, event);

		if (this.events.size >= this.maxBatchSize) {
			void this.runBatch();
			return;
		}

		if (this.timer) {
			clearTimeout(this.timer);
		}

		this.timer = setTimeout(() => {
			void this.runBatch();
		}, this.batchWindow);
	}

	async flush(): Promise<void> {
		const results = await Promise.allSettled([
			this.runBatch(),
			...Array.from(this.inFlightBatches),
		]);
		const failure = results.find((r) => r.status === "rejected");
		if (failure && failure.status === "rejected") throw failure.reason;
	}

	private runBatch(): Promise<void> {
		const batchPromise = this.executeBatch().finally(() => {
			this.inFlightBatches.delete(batchPromise);
		});
		this.inFlightBatches.add(batchPromise);
		return batchPromise;
	}

	private async executeBatch(): Promise<void> {
		if (this.timer) {
			clearTimeout(this.timer);
			this.timer = null;
		}

		if (this.events.size === 0) {
			return;
		}

		const currentEvents = new Map(this.events);
		this.events.clear();

		const eventItems = Array.from(currentEvents.values());

		await addTaskToQueue({
			jobName: JobName.InsertEventBatch,
			payload: { events: eventItems },
		});

		await sendEventsToTinybird({
			events: eventItems,
			logger,
		});
	}
}

export const globalEventBatchingManager = new BatchingManager();

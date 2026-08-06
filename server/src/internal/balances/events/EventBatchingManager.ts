import type { EventInsert } from "@autumn/shared";
import { logger } from "@server/external/logtail/logtailUtils.js";
import { sendEventsToTinybird } from "@server/external/tinybird/sendEvents/sendEvents.js";
import { JobName } from "@server/queue/JobName.js";
import { addTaskToQueue } from "@server/queue/queueUtils.js";

type AddEventBatchToQueue = (args: {
	jobName: JobName.InsertEventBatch;
	payload: { events: EventInsert[] };
}) => Promise<void>;

export class EventBatchingManager {
	private events: Map<string, EventInsert> = new Map();
	private timer: NodeJS.Timeout | null = null;
	private readonly inFlightExecutions = new Set<Promise<void>>();
	private readonly batchWindow: number;
	private readonly maxBatchSize = 200; // Max events per batch (~200kb per event, keep batches under 10MB for Tinybird)
	private readonly _addTaskToQueue: AddEventBatchToQueue;

	constructor({
		addTaskToQueueFn,
		batchWindowMs,
	}: {
		addTaskToQueueFn?: AddEventBatchToQueue;
		batchWindowMs?: number;
	} = {}) {
		this._addTaskToQueue = addTaskToQueueFn ?? addTaskToQueue;
		this.batchWindow = batchWindowMs ?? 350;
	}

	/** Add an event to the batch */
	addEvent(event: EventInsert): void {
		const key = event.id;
		this.events.set(key, event);

		// Auto-execute if batch size is reached
		if (this.events.size >= this.maxBatchSize) {
			this.startBatchInBackground();
			return;
		}

		// Start/reset timer for batch execution
		if (this.timer) {
			clearTimeout(this.timer);
		}

		this.timer = setTimeout(() => {
			this.startBatchInBackground();
		}, this.batchWindow);
	}

	async flush(): Promise<void> {
		await this.startBatch();
		while (this.inFlightExecutions.size > 0) {
			await Promise.all(Array.from(this.inFlightExecutions));
		}
	}

	private startBatch(): Promise<void> {
		const execution = this.executeBatch();
		this.inFlightExecutions.add(execution);
		void execution.then(
			() => this.inFlightExecutions.delete(execution),
			() => this.inFlightExecutions.delete(execution),
		);
		return execution;
	}

	private startBatchInBackground(): void {
		void this.startBatch().catch((error: unknown) => {
			logger.error("[EventBatchingManager] Failed to execute batch", { error });
		});
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
		await this._addTaskToQueue({
			jobName: JobName.InsertEventBatch,
			payload: { events: eventItems },
		});

		await sendEventsToTinybird({
			events: eventItems,
			logger,
		});
	}
}

// Global singleton instance
export const globalEventBatchingManager = new EventBatchingManager();

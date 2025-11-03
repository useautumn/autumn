import { JobName } from "../../../../queue/JobName.js";
import { addTaskToQueue } from "../../../../queue/queueUtils.js";

interface EventContext {
	// Org and env
	orgId: string;
	orgSlug: string;
	env: string;

	// Customer
	customerId: string;

	// Entity (optional)
	entityId?: string;

	// Event details
	eventName: string;
	value?: number;
	properties?: Record<string, any>;
	timestamp?: number;
}

class BatchingManager {
	private events: Map<string, EventContext> = new Map();
	private timer: NodeJS.Timeout | null = null;
	private readonly batchWindow = 100; // 100ms batching window
	private readonly maxBatchSize = 5000; // Max events per batch (PostgreSQL has ~65k param limit, ~11 fields per event = ~5.9k max)

	/**
	 * Add an event to the batch
	 */
	addEvent(event: EventContext): void {
		// Generate a unique key for deduplication
		// Use timestamp + customer + event to allow same customer/event multiple times
		const key = `${event.customerId}:${event.eventName}:${Date.now()}:${Math.random()}`;

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

	/**
	 * Execute the current batch by queuing to BullMQ
	 */
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

		try {
			const eventItems = Array.from(currentEvents.values());
			await addTaskToQueue({
				jobName: JobName.InsertEventBatch,
				payload: {
					events: eventItems,
				},
			});
		} catch (error) {
			console.error(`❌ Failed to queue event batch:`, error);
		}
	}
}

// Global singleton instance
export const globalEventBatchingManager = new BatchingManager();

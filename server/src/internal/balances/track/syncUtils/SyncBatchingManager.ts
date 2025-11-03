import { JobName } from "@/queue/JobName.js";
import { addTaskToQueue } from "@/queue/queueUtils.js";

interface SyncPairContext {
	customerId: string;
	featureId: string;
	orgId: string;
	env: string;
	entityId?: string;
}

interface Batch {
	pairs: Map<string, SyncPairContext>;
	timer: NodeJS.Timeout | null;
}

/**
 * Batching manager for syncing Redis balance deductions to PostgreSQL
 * Accumulates unique (customerId, featureId) pairs and flushes to BullMQ for async sync
 *
 * Benefits:
 * - Deduplication: Same pair only synced once per batch window
 * - Reduced DB load: Multiple pairs batched together
 * - Non-blocking: Track endpoint returns immediately
 */
export class SyncBatchingManager {
	private batch: Batch = {
		pairs: new Map(),
		timer: null,
	};

	private readonly BATCH_WINDOW_MS = 100; // 100ms batching window
	private readonly MAX_BATCH_SIZE = 10000; // Max unique pairs per batch

	/**
	 * Add a (customerId, featureId) pair to the sync batch
	 * Idempotent - multiple calls for same pair only result in one sync
	 */
	addSyncPair({
		customerId,
		featureId,
		orgId,
		env,
		entityId,
	}: SyncPairContext): void {
		// Create unique key for this pair
		const pairKey = `${orgId}:${env}:${customerId}:${featureId}${entityId ? `:${entityId}` : ""}`;

		// If this is the first pair, schedule batch execution
		if (this.batch.pairs.size === 0) {
			this.scheduleBatch();
		}

		// Add or update pair (Map handles deduplication)
		this.batch.pairs.set(pairKey, {
			customerId,
			featureId,
			orgId,
			env,
			entityId,
		});

		// Force flush if batch is full
		if (this.batch.pairs.size >= this.MAX_BATCH_SIZE) {
			this.executeBatch();
		}
	}

	/**
	 * Schedule batch execution after window expires
	 */
	private scheduleBatch(): void {
		this.batch.timer = setTimeout(() => {
			this.executeBatch();
		}, this.BATCH_WINDOW_MS);
	}

	/**
	 * Execute the batch - flush all accumulated pairs to BullMQ
	 */
	private async executeBatch(): Promise<void> {
		// Clear timer
		if (this.batch.timer) {
			clearTimeout(this.batch.timer);
			this.batch.timer = null;
		}

		// Snapshot current batch and reset for new requests
		const currentPairs = this.batch.pairs;
		this.batch.pairs = new Map();

		if (currentPairs.size === 0) {
			return;
		}

		try {
			// Convert Map to array for job payload
			const items = Array.from(currentPairs.values());

			// Queue the sync job
			await addTaskToQueue({
				jobName: JobName.SyncBalanceBatch,
				payload: {
					items,
				},
			});
		} catch (error) {
			console.error(`❌ Failed to queue sync batch:`, error);
			// TODO: Consider retry logic or dead letter queue
		}
	}

	/**
	 * Get current batch statistics (for monitoring)
	 */
	getStats(): {
		pendingPairs: number;
		timerActive: boolean;
	} {
		return {
			pendingPairs: this.batch.pairs.size,
			timerActive: this.batch.timer !== null,
		};
	}

	/**
	 * Force flush the current batch (useful for graceful shutdown)
	 */
	async flush(): Promise<void> {
		await this.executeBatch();
	}
}

// Singleton instance
export const globalSyncBatchingManager = new SyncBatchingManager();

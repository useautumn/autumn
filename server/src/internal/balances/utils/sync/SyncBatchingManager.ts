import type { AppEnv } from "@autumn/shared";
import { currentRegion } from "@/external/redis/initRedis.js";
import { JobName } from "@/queue/JobName.js";
import { addTaskToQueue } from "@/queue/queueUtils.js";
import { logger } from "../../../../external/logtail/logtailUtils";

const hashPairKey = (key: string): string => {
	return Bun.hash(key).toString(36);
};

interface SyncPairContext {
	customerId: string;
	featureId: string;
	orgId: string;
	env: AppEnv;
	entityId?: string;
	region: string;
	timestamp: number;
	breakdownIds: string[];
}

interface CustomerBatch {
	pairs: Map<string, SyncPairContext>;
	timer: NodeJS.Timeout | null;
}

/**
 * Batching manager for syncing Redis balance deductions to PostgreSQL
 * Collects sync items within a time window, then queues each item individually to SQS
 *
 * Benefits:
 * - In-memory deduplication: Same pair only queued once per batch window (500ms)
 * - SQS deduplication: MessageDeduplicationId prevents duplicate processing (5 min window)
 * - Per-customer FIFO ordering: MessageGroupId ensures ordered processing per customer
 * - Non-blocking: Track endpoint returns immediately
 * - Simple: Each sync item is a separate SQS message, easy to retry and monitor
 */
export class SyncBatchingManager {
	// Map of customerId -> batch
	private customerBatches: Map<string, CustomerBatch> = new Map();

	private readonly BATCH_WINDOW_MS =
		process.env.NODE_ENV === "development" ? 500 : 1000; // 1000ms batching window
	private readonly MAX_BATCH_SIZE_PER_CUSTOMER = 1000; // Max unique pairs per customer batch

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
		region,
		breakdownIds,
	}: Omit<SyncPairContext, "timestamp">): void {
		// Get or create batch for this customer
		let customerBatch = this.customerBatches.get(customerId);
		if (!customerBatch) {
			customerBatch = {
				pairs: new Map(),
				timer: null,
			};
			this.customerBatches.set(customerId, customerBatch);
		}

		// Create unique key for this pair (within customer scope)
		const rawKey = `${orgId}:${env}:${featureId}${entityId ? `:${entityId}` : ""}`;
		const pairKey = hashPairKey(rawKey);

		// If this is the first pair for this customer, schedule batch execution
		if (customerBatch.pairs.size === 0) {
			this.scheduleCustomerBatch({ customerId });
		}

		// Add or update pair (Map handles deduplication)
		// Use the earliest timestamp if the pair already exists, otherwise use current time

		const existingPair = customerBatch.pairs.get(pairKey);
		customerBatch.pairs.set(pairKey, {
			customerId,
			featureId,
			orgId,
			env,
			entityId,
			region: region || currentRegion,
			timestamp: existingPair?.timestamp ?? Date.now(),
			breakdownIds: existingPair
				? [...new Set([...existingPair.breakdownIds, ...breakdownIds])]
				: breakdownIds,
		});

		// Force flush if batch is full
		if (customerBatch.pairs.size >= this.MAX_BATCH_SIZE_PER_CUSTOMER) {
			this.executeCustomerBatch({ customerId });
		}
	}

	/**
	 * Schedule batch execution for a specific customer after window expires
	 */
	private scheduleCustomerBatch({ customerId }: { customerId: string }): void {
		const customerBatch = this.customerBatches.get(customerId);
		if (!customerBatch) return;

		customerBatch.timer = setTimeout(() => {
			this.executeCustomerBatch({ customerId });
		}, this.BATCH_WINDOW_MS);
	}

	/**
	 * Execute the batch for a specific customer - flush to SQS
	 * Queues each sync item individually with deduplication
	 */
	private async executeCustomerBatch({
		customerId,
	}: {
		customerId: string;
	}): Promise<void> {
		const customerBatch = this.customerBatches.get(customerId);
		if (!customerBatch) return;

		// Clear timer
		if (customerBatch.timer) {
			clearTimeout(customerBatch.timer);
			customerBatch.timer = null;
		}

		// Snapshot current batch and remove from map
		const currentPairs = customerBatch.pairs;
		this.customerBatches.delete(customerId);

		if (currentPairs.size === 0) {
			return;
		}

		try {
			// Queue each sync item individually with deduplication
			const items = Array.from(currentPairs.values());

			for (const item of items) {
				// Create deterministic deduplication key from sync item fields
				const dedupKey = item.entityId
					? `${item.orgId}:${item.env}:${item.customerId}:${item.featureId}:${item.entityId}`
					: `${item.orgId}:${item.env}:${item.customerId}:${item.featureId}`;

				// Deduplicate messages in a 10ms window
				const dedupTimestamp = Math.floor(Date.now() / 10);

				// Hash to create AWS-friendly alphanumeric ID
				const dedupHash = Bun.hash(`${dedupKey}:${dedupTimestamp}`).toString(
					36,
				);

				await addTaskToQueue({
					jobName: JobName.SyncBalanceBatchV2,
					payload: {
						orgId: item.orgId,
						env: item.env,
						customerId: item.customerId,
						item, // Single item
					},
					messageGroupId: customerId, // FIFO ordering per customer
					messageDeduplicationId: dedupHash, // SQS deduplication (1-second window)
				});
				logger.info(
					`Queued sync item for customer ${customerId}, feature: ${item.featureId}${item.entityId ? `, entity: ${item.entityId}` : ""}`,
				);
			}
		} catch (error) {
			logger.error(
				`❌ Failed to queue sync items for customer ${customerId}, error: ${error instanceof Error ? error.message : "unknown"}`,
				{
					error: error instanceof Error ? error : new Error(String(error)),
					customerId,
				},
			);
			console.error(
				`❌ Failed to queue sync items for customer ${customerId}:`,
				error,
			);
			// TODO: Consider retry logic or dead letter queue
		}
	}

	/**
	 * Get current batch statistics (for monitoring)
	 */
	getStats(): {
		totalCustomers: number;
		totalPendingPairs: number;
		activeTimers: number;
	} {
		let totalPairs = 0;
		let activeTimers = 0;

		for (const batch of this.customerBatches.values()) {
			totalPairs += batch.pairs.size;
			if (batch.timer !== null) activeTimers++;
		}

		return {
			totalCustomers: this.customerBatches.size,
			totalPendingPairs: totalPairs,
			activeTimers,
		};
	}

	/**
	 * Force flush all customer batches (useful for graceful shutdown)
	 */
	async flush(): Promise<void> {
		const customerIds = Array.from(this.customerBatches.keys());
		await Promise.all(
			customerIds.map((customerId) =>
				this.executeCustomerBatch({ customerId }),
			),
		);
	}
}

// Singleton instance
export const globalSyncBatchingManager = new SyncBatchingManager();

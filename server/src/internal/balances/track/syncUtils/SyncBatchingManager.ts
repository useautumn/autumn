import type { AppEnv } from "@autumn/shared";
import { JobName } from "@/queue/JobName.js";
import { addTaskToQueue } from "@/queue/queueUtils.js";
import { logger } from "../../../../external/logtail/logtailUtils";

interface SyncPairContext {
	customerId: string;
	featureId: string;
	orgId: string;
	env: AppEnv;
	entityId?: string;
	timestamp: number;
}

interface CustomerBatch {
	pairs: Map<string, SyncPairContext>;
	timer: NodeJS.Timeout | null;
}

/**
 * Batching manager for syncing Redis balance deductions to PostgreSQL
 * Maintains separate batches per customer for proper FIFO ordering in SQS
 *
 * Benefits:
 * - Deduplication: Same pair only synced once per batch window
 * - Per-customer ordering: Each customer's updates maintain FIFO order
 * - Reduced DB load: Multiple pairs batched together per customer
 * - Non-blocking: Track endpoint returns immediately
 */
export class SyncBatchingManager {
	// Map of customerId -> batch
	private customerBatches: Map<string, CustomerBatch> = new Map();

	private readonly BATCH_WINDOW_MS = 500; // 100ms batching window
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
		const pairKey = `${orgId}:${env}:${featureId}${entityId ? `:${entityId}` : ""}`;

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
			timestamp: existingPair?.timestamp ?? Date.now(),
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
			// Convert Map to array for job payload
			const items = Array.from(currentPairs.values());

			// Queue the sync job with customer ID as MessageGroupId (for SQS FIFO)
			await addTaskToQueue({
				jobName: JobName.SyncBalanceBatch,
				payload: {
					orgId: items?.[0]?.orgId,
					env: items?.[0]?.env,
					items,
				},
				messageGroupId: customerId,
			});
			// console.log(
			// 	`Queued sync batch for customer ${customerId} with ${items.length} items`,
			// );
		} catch (error) {
			logger.error(
				`❌ Failed to queue sync batch for customer ${customerId}, error: ${error instanceof Error ? error.message : "unknown"}`,
				{
					error: error instanceof Error ? error : new Error(String(error)),
					customerId,
				},
			);
			console.error(
				`❌ Failed to queue sync batch for customer ${customerId}:`,
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

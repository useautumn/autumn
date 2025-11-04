import { redis } from "../../../../external/redis/initRedis.js";
import { buildCachedApiCustomerKey } from "../../../customers/cusUtils/apiCusCacheUtils/getCachedApiCustomer.js";
import { executeBatchDeduction } from "./executeBatchDeduction.js";

interface FeatureDeduction {
	featureId: string;
	amount: number;
}

interface BatchRequest {
	featureDeductions: FeatureDeduction[];
	overageBehavior: "cap" | "reject";
	entityId?: string;
	resolve: (result: { success: boolean; error?: string }) => void;
	reject: (error: Error) => void;
}

interface Batch {
	requests: BatchRequest[];
	timer: NodeJS.Timeout | null;
	customerId: string;
	orgId: string;
	env: string;
	entityId?: string;
}

/**
 * Batching manager for Redis track deductions
 * Collects multiple deduction requests within a time window and processes them atomically in a single Lua script
 *
 * Benefits:
 * - Massive performance improvements for high-concurrency scenarios
 * - Atomic deductions across multiple requests
 * - Reduced Redis round trips
 */
export class BatchingManager {
	private batches = new Map<string, Batch>();
	private readonly BATCH_WINDOW_MS = 10; // 10ms batching window
	private readonly MAX_BATCH_SIZE = 100000; // Handle up to 100k concurrent requests

	/**
	 * Request a deduction with automatic batching
	 * Returns a promise that resolves when the batch is processed
	 */
	async deduct({
		customerId,
		featureDeductions,
		orgId,
		env,
		entityId,
		overageBehavior = "cap",
	}: {
		customerId: string;
		featureDeductions: FeatureDeduction[];
		orgId: string;
		env: string;
		entityId?: string;
		overageBehavior?: "cap" | "reject";
	}): Promise<{ success: boolean; error?: string }> {
		const cacheKey = buildCachedApiCustomerKey({
			customerId,
			orgId,
			env,
		});
		const batchKey = cacheKey; // Batch by customer only

		return new Promise((resolve, reject) => {
			// Create batch if it doesn't exist
			if (!this.batches.has(batchKey)) {
				this.batches.set(batchKey, {
					requests: [],
					timer: null,
					customerId,
					orgId,
					env,
					entityId,
				});

				// Schedule batch execution
				this.scheduleBatch(batchKey);
			}

			const batch = this.batches.get(batchKey);
			if (!batch) {
				reject(new Error("Failed to get batch"));
				return;
			}

			// Add request to batch
			batch.requests.push({
				featureDeductions,
				overageBehavior,
				entityId,
				resolve,
				reject,
			});

			// Force flush if batch is full
			if (batch.requests.length >= this.MAX_BATCH_SIZE) {
				this.executeBatch(batchKey);
			}
		});
	}

	/**
	 * Schedule batch execution after window expires
	 */
	private scheduleBatch(batchKey: string): void {
		const batch = this.batches.get(batchKey);
		if (!batch) return;

		batch.timer = setTimeout(() => {
			this.executeBatch(batchKey);
		}, this.BATCH_WINDOW_MS);
	}

	/**
	 * Execute the batch - process all requests in one Lua script
	 */
	private async executeBatch(batchKey: string): Promise<void> {
		// CRITICAL: Remove batch from map FIRST to prevent race condition
		// New requests will create a new batch instead of adding to this one
		const batch = this.batches.get(batchKey);
		if (!batch || batch.requests.length === 0) {
			return;
		}

		// Clear timer and remove from map IMMEDIATELY
		if (batch.timer) {
			clearTimeout(batch.timer);
			batch.timer = null;
		}
		this.batches.delete(batchKey);

		const requests = batch.requests;
		const batchSize = requests.length;

		// Build cache key from batch context
		const cacheKey = buildCachedApiCustomerKey({
			customerId: batch.customerId,
			orgId: batch.orgId,
			env: batch.env,
		});

		console.log(
			`🚀 Executing batch with ${batchSize} requests for customer ${batch.customerId}`,
		);

		try {
			// Execute batch Lua script
			const result = await executeBatchDeduction({
				redis,
				cacheKey,
				requests: requests.map((r) => ({
					featureDeductions: r.featureDeductions,
					overageBehavior: r.overageBehavior,
					entityId: r.entityId,
				})),
			});

			console.log(`✅ Batch completed (${batchSize} requests)`);

			// Resolve each request based on its individual result
			if (result.success && result.results) {
				// TODO: Queue Postgres sync job for successful deductions if needed
				// This can be added later when integrating with the sync system

				// Match each request with its result
				for (let i = 0; i < requests.length; i++) {
					const requestResult = result.results[i];
					requests[i].resolve({
						success: requestResult?.success || false,
						error: requestResult?.error,
					});
				}
			} else {
				// Batch failed entirely (e.g., customer not found)
				for (const request of requests) {
					request.resolve({
						success: false,
						error: result.error || "BATCH_FAILED",
					});
				}
			}
		} catch (error) {
			console.error(`❌ Batch execution error:`, error);
			// Reject all requests on error
			for (const request of requests) {
				request.reject(
					error instanceof Error ? error : new Error(String(error)),
				);
			}
		}
	}

	/**
	 * Get current batch statistics (for monitoring)
	 */
	getStats(): {
		activeBatches: number;
		totalPendingRequests: number;
	} {
		let totalPendingRequests = 0;
		for (const batch of this.batches.values()) {
			totalPendingRequests += batch.requests.length;
		}

		return {
			activeBatches: this.batches.size,
			totalPendingRequests,
		};
	}
}

// Singleton instance
export const globalBatchingManager = new BatchingManager();

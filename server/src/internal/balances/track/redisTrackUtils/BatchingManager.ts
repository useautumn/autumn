import type { ApiBalance } from "@autumn/shared";
import { redis } from "../../../../external/redis/initRedis.js";
import { buildCachedApiCustomerKey } from "../../../customers/cusUtils/apiCusCacheUtils/getCachedApiCustomer.js";
import { buildCachedApiEntityKey } from "../../../entities/entityUtils/apiEntityCacheUtils/getCachedApiEntity.js";
import { executeBatchDeduction } from "./executeBatchDeduction.js";

interface FeatureDeduction {
	featureId: string;
	amount: number;
}

export interface DeductionResult {
	success: boolean;
	error?: string;
	customerChanged?: boolean;
	changedEntityIds?: string[];
	balances?: Record<string, ApiBalance>; // Object of changed balances keyed by featureId
}

interface BatchRequest {
	featureDeductions: FeatureDeduction[];
	overageBehavior: "cap" | "reject";
	resolve: (result: DeductionResult) => void;
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
	}): Promise<DeductionResult> {
		// CRITICAL: Batch by customer AND entity (if entity-level deduction)
		// This ensures entity-level deductions are atomic per entity
		// Customer-level: {orgId}:env:customer:{customerId}
		// Entity-level: {orgId}:env:customer:{customerId}:entity:{entityId}
		const batchKey = entityId
			? buildCachedApiEntityKey({ entityId, customerId, orgId, env })
			: buildCachedApiCustomerKey({ customerId, orgId, env });

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

		try {
			// Execute batch Lua script (Lua builds cache key internally)
			// All requests in this batch have the same entityId (batch-level)
			const result = await executeBatchDeduction({
				redis,
				requests: requests.map((r) => ({
					featureDeductions: r.featureDeductions,
					overageBehavior: r.overageBehavior,
					entityId: batch.entityId, // Use batch-level entityId (same for all requests)
				})),
				orgId: batch.orgId,
				env: batch.env,
				customerId: batch.customerId,
			});

			// Resolve each request based on its individual result
			if (result.success && result.results) {
				// Match each request with its result
				// All requests in this batch get the same customerChanged/changedEntityIds
				for (let i = 0; i < requests.length; i++) {
					const requestResult = result.results[i];
					requests[i].resolve({
						success: requestResult?.success || false,
						error: requestResult?.error,
						customerChanged: result.customerChanged,
						changedEntityIds: result.changedEntityIds,
						balances: result.balances,
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

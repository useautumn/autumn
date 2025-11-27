// import type { Redis } from "ioredis";
// import { executeBatchDeduction } from "./executeBatchDeduction.js";

// interface BatchRequest {
// 	amount: number;
// 	timestamp: number;
// 	properties: Record<string, any>;
// 	resolve: (result: { success: boolean; error?: string }) => void;
// 	reject: (error: Error) => void;
// }

// export interface BatchContext {
// 	customerId: string;
// 	featureId: string;
// 	orgId: string;
// 	orgSlug: string;
// 	env: string;
// 	entityId?: string;
// }

// interface Batch {
// 	requests: BatchRequest[];
// 	timer: NodeJS.Timeout | null;
// 	context?: BatchContext;
// }

// /**
//  * Batching manager for Redis track deductions
//  * Collects multiple deduction requests within a time window and processes them atomically in a single Lua script
//  *
//  * Benefits:
//  * - Massive performance improvements for high-concurrency scenarios
//  * - Atomic deductions across multiple requests
//  * - Reduced Redis round trips
//  */
// export class BatchingManager {
// 	private batches = new Map<string, Batch>();
// 	private readonly BATCH_WINDOW_MS = 10; // 10ms batching window
// 	private readonly MAX_BATCH_SIZE = 100000; // Handle up to 100k concurrent requests

// 	/**
// 	 * Request a deduction with automatic batching
// 	 * Returns a promise that resolves when the batch is processed
// 	 */
// 	async deduct({
// 		redis,
// 		cacheKey,
// 		featureId,
// 		amount,
// 		timestamp,
// 		properties,
// 		context,
// 	}: {
// 		redis: Redis;
// 		cacheKey: string;
// 		featureId: string;
// 		amount: number;
// 		timestamp: number;
// 		properties: Record<string, any>;
// 		context: BatchContext;
// 	}): Promise<{ success: boolean; error?: string }> {
// 		const batchKey = `${cacheKey}:${featureId}`;

// 		return new Promise((resolve, reject) => {
// 			// Create batch if it doesn't exist
// 			if (!this.batches.has(batchKey)) {
// 				this.batches.set(batchKey, {
// 					requests: [],
// 					timer: null,
// 					context,
// 				});

// 				// Schedule batch execution
// 				this.scheduleBatch(batchKey, redis, cacheKey, featureId);
// 			}

// 			const batch = this.batches.get(batchKey);
// 			if (!batch) {
// 				reject(new Error("Failed to get batch"));
// 				return;
// 			}

// 			// Add request to batch
// 			batch.requests.push({
// 				amount,
// 				timestamp,
// 				properties,
// 				resolve,
// 				reject,
// 			});

// 			// Force flush if batch is full
// 			if (batch.requests.length >= this.MAX_BATCH_SIZE) {
// 				this.executeBatch(batchKey, redis, cacheKey, featureId);
// 			}
// 		});
// 	}

// 	/**
// 	 * Schedule batch execution after window expires
// 	 */
// 	private scheduleBatch(
// 		batchKey: string,
// 		redis: Redis,
// 		cacheKey: string,
// 		featureId: string,
// 	): void {
// 		const batch = this.batches.get(batchKey);
// 		if (!batch) return;

// 		batch.timer = setTimeout(() => {
// 			this.executeBatch(batchKey, redis, cacheKey, featureId);
// 		}, this.BATCH_WINDOW_MS);
// 	}

// 	/**
// 	 * Execute the batch - process all requests in one Lua script
// 	 */
// 	private async executeBatch(
// 		batchKey: string,
// 		redis: Redis,
// 		cacheKey: string,
// 		featureId: string,
// 	): Promise<void> {
// 		// CRITICAL: Remove batch from map FIRST to prevent race condition
// 		// New requests will create a new batch instead of adding to this one
// 		const batch = this.batches.get(batchKey);
// 		if (!batch || batch.requests.length === 0) {
// 			return;
// 		}

// 		// Clear timer and remove from map IMMEDIATELY
// 		if (batch.timer) {
// 			clearTimeout(batch.timer);
// 			batch.timer = null;
// 		}
// 		this.batches.delete(batchKey);

// 		const requests = batch.requests;
// 		const amounts = requests.map((r) => r.amount);
// 		const batchSize = requests.length;

// 		console.log(
// 			`🚀 Executing batch with ${batchSize} requests for feature ${featureId}`,
// 		);

// 		try {
// 			// Execute batch Lua script
// 			const result = await executeBatchDeduction({
// 				redis,
// 				cacheKey,
// 				targetFeatureId: featureId,
// 				amounts,
// 			});

// 			console.log(
// 				`✅ Batch completed (${batchSize} requests, ${result.successCount} succeeded)`,
// 			);

// 			// Resolve each request based on success/fail counts
// 			if (result.success) {
// 				const successCount = result.successCount || 0;

// 				// TODO: Queue Postgres sync job for successful deductions if needed
// 				// This can be added later when integrating with the sync system

// 				// First N requests succeed, rest fail
// 				for (let i = 0; i < requests.length; i++) {
// 					requests[i].resolve({
// 						success: i < successCount,
// 						error:
// 							i < successCount
// 								? undefined
// 								: result.error || "INSUFFICIENT_BALANCE",
// 					});
// 				}
// 			} else {
// 				// Batch failed entirely (e.g., customer not found)
// 				for (const request of requests) {
// 					request.resolve({
// 						success: false,
// 						error: result.error || "BATCH_FAILED",
// 					});
// 				}
// 			}
// 		} catch (error) {
// 			console.error(`❌ Batch execution error:`, error);
// 			// Reject all requests on error
// 			for (const request of requests) {
// 				request.reject(
// 					error instanceof Error ? error : new Error(String(error)),
// 				);
// 			}
// 		}
// 	}

// 	/**
// 	 * Get current batch statistics (for monitoring)
// 	 */
// 	getStats(): {
// 		activeBatches: number;
// 		totalPendingRequests: number;
// 	} {
// 		let totalPendingRequests = 0;
// 		for (const batch of this.batches.values()) {
// 			totalPendingRequests += batch.requests.length;
// 		}

// 		return {
// 			activeBatches: this.batches.size,
// 			totalPendingRequests,
// 		};
// 	}
// }

// // Singleton instance
// export const globalBatchingManager = new BatchingManager();

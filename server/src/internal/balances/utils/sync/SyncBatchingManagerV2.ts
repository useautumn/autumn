import type { AppEnv } from "@autumn/shared";
import { logger } from "@/external/logtail/logtailUtils.js";
import { currentRegion } from "@/external/redis/initRedis.js";
import { JobName } from "@/queue/JobName.js";
import { addTaskToQueue } from "@/queue/queueUtils.js";

interface CustomerBatchContext {
	customerId: string;
	orgId: string;
	env: AppEnv;
	region: string;
	timestamp: number;
	cusEntIds: Set<string>;
	rolloverIds: Set<string>;
}

interface CustomerBatch {
	context: CustomerBatchContext;
	timer: NodeJS.Timeout | null;
}

export type QueueSyncPayload = {
	jobName: string;
	payload: {
		customerId: string;
		orgId: string;
		env: AppEnv;
		region: string;
		timestamp: number;
		cusEntIds: string[];
		rolloverIds: string[];
	};
	messageGroupId?: string;
	messageDeduplicationId: string;
};

/**
 * Batches sync jobs per customer using a fixed tumbling window.
 * Timer is set once when the batch is created — subsequent items just merge.
 * Cross-instance dedup is handled via a stable SQS/BullMQ dedup ID
 * bucketed at DEDUP_BUCKET_MS.
 */
export class SyncBatchingManagerV2 {
	private customerBatches: Map<string, CustomerBatch> = new Map();

	/** Fixed window: the batch flushes this long after the first item */
	private readonly BATCH_WINDOW_MS: number = 1000; // 1 second batch window
	private readonly MAX_BATCH_SIZE = 1000;

	/** Cross-instance dedup bucket. Messages with the same content in the same bucket share a dedup ID. */
	private readonly DEDUP_BUCKET_MS: number = 2500; // 2.5 seconds dedup bucket

	/** Injectable queue function — overridable for tests */
	private readonly _addTaskToQueue: (args: QueueSyncPayload) => Promise<void>;

	constructor({
		addTaskToQueueFn,
		batchWindowMs,
		dedupBucketMs,
	}: {
		addTaskToQueueFn?: (args: QueueSyncPayload) => Promise<void>;
		batchWindowMs?: number;
		dedupBucketMs?: number;
	} = {}) {
		this._addTaskToQueue =
			addTaskToQueueFn ??
			(addTaskToQueue as unknown as (args: QueueSyncPayload) => Promise<void>);
		this.BATCH_WINDOW_MS = batchWindowMs ?? 1000;
		this.DEDUP_BUCKET_MS = dedupBucketMs ?? 2500;
	}

	addSyncItem({
		customerId,
		orgId,
		env,
		cusEntIds,
		rolloverIds,
		region,
	}: {
		customerId: string;
		orgId: string;
		env: AppEnv;
		cusEntIds: string[];
		rolloverIds?: string[];
		region?: string;
	}): void {
		const batchKey = this.buildBatchKey({ orgId, env, customerId });
		let batch = this.customerBatches.get(batchKey);

		if (!batch) {
			batch = this.createBatch({ customerId, orgId, env, region });
			this.customerBatches.set(batchKey, batch);
			// Fixed window: schedule ONCE when the batch is created.
			// Subsequent items just merge — the timer is not reset.
			this.scheduleCustomerBatch({ batchKey });
		}

		this.mergeCusEntIds({ batch, cusEntIds });
		this.mergeRolloverIds({ batch, rolloverIds: rolloverIds ?? [] });

		if (region) {
			batch.context.region = region;
		}

		const totalSize =
			batch.context.cusEntIds.size + batch.context.rolloverIds.size;
		if (totalSize >= this.MAX_BATCH_SIZE) {
			this.executeCustomerBatch({ batchKey });
		}
	}

	getStats(): {
		totalCustomers: number;
		totalPendingEntitlements: number;
		totalPendingRollovers: number;
	} {
		let totalEntitlements = 0;
		let totalRollovers = 0;
		for (const batch of this.customerBatches.values()) {
			totalEntitlements += batch.context.cusEntIds.size;
			totalRollovers += batch.context.rolloverIds.size;
		}
		return {
			totalCustomers: this.customerBatches.size,
			totalPendingEntitlements: totalEntitlements,
			totalPendingRollovers: totalRollovers,
		};
	}

	async flush(): Promise<void> {
		const batchKeys = Array.from(this.customerBatches.keys());
		await Promise.all(
			batchKeys.map((batchKey) => this.executeCustomerBatch({ batchKey })),
		);
	}

	private buildBatchKey({
		orgId,
		env,
		customerId,
	}: {
		orgId: string;
		env: AppEnv;
		customerId: string;
	}): string {
		return `${orgId}:${env}:${customerId}`;
	}

	private createBatch({
		customerId,
		orgId,
		env,
		region,
	}: {
		customerId: string;
		orgId: string;
		env: AppEnv;
		region?: string;
	}): CustomerBatch {
		return {
			context: {
				customerId,
				orgId,
				env,
				region: region || currentRegion,
				timestamp: Date.now(),
				cusEntIds: new Set(),
				rolloverIds: new Set(),
			},
			timer: null,
		};
	}

	private mergeCusEntIds({
		batch,
		cusEntIds,
	}: {
		batch: CustomerBatch;
		cusEntIds: string[];
	}): void {
		for (const id of cusEntIds) {
			batch.context.cusEntIds.add(id);
		}
	}

	private mergeRolloverIds({
		batch,
		rolloverIds,
	}: {
		batch: CustomerBatch;
		rolloverIds: string[];
	}): void {
		for (const id of rolloverIds) {
			batch.context.rolloverIds.add(id);
		}
	}

	private scheduleCustomerBatch({ batchKey }: { batchKey: string }): void {
		const batch = this.customerBatches.get(batchKey);
		if (!batch) return;

		batch.timer = setTimeout(() => {
			this.executeCustomerBatch({ batchKey });
		}, this.BATCH_WINDOW_MS);

		if (batch.timer.unref) {
			batch.timer.unref();
		}
	}

	private async executeCustomerBatch({
		batchKey,
	}: {
		batchKey: string;
	}): Promise<void> {
		const batch = this.customerBatches.get(batchKey);
		if (!batch) return;

		this.clearBatchTimer({ batch });
		this.customerBatches.delete(batchKey);

		const { context } = batch;
		if (context.cusEntIds.size === 0 && context.rolloverIds.size === 0) return;

		await this.queueSyncJob({ context });
	}

	private clearBatchTimer({ batch }: { batch: CustomerBatch }): void {
		if (batch.timer) {
			clearTimeout(batch.timer);
			batch.timer = null;
		}
	}

	/** Stable dedup ID from batch content + 5s time bucket */
	private buildDeduplicationId({
		context,
		cusEntIds,
		rolloverIds,
	}: {
		context: CustomerBatchContext;
		cusEntIds: string[];
		rolloverIds: string[];
	}): string {
		const dedupBucket = Math.floor(Date.now() / this.DEDUP_BUCKET_MS);
		const dedupKey = JSON.stringify({
			jobName: JobName.SyncBalanceBatchV3,
			orgId: context.orgId,
			env: context.env,
			customerId: context.customerId,
			cusEntIds,
			rolloverIds,
			dedupBucket,
		});

		return Bun.hash(dedupKey).toString();
	}

	private async queueSyncJob({
		context,
	}: {
		context: CustomerBatchContext;
	}): Promise<void> {
		const cusEntIds = Array.from(context.cusEntIds).sort();
		const rolloverIds = Array.from(context.rolloverIds).sort();
		const messageDeduplicationId = this.buildDeduplicationId({
			context,
			cusEntIds,
			rolloverIds,
		});

		try {
			await this._addTaskToQueue({
				jobName: JobName.SyncBalanceBatchV3,
				payload: {
					customerId: context.customerId,
					orgId: context.orgId,
					env: context.env,
					region: context.region,
					timestamp: Date.now(),
					cusEntIds,
					rolloverIds,
				},
				messageDeduplicationId,
			});

			logger.info(
				`[SyncV3] Queued sync for ${context.customerId}, ${cusEntIds.length} entitlements, ${rolloverIds.length} rollovers`,
			);
		} catch (error) {
			logger.error(
				`[SyncV3] Failed to queue sync for ${context.customerId}: ${error}`,
			);
		}
	}
}

export const globalSyncBatchingManagerV2 = new SyncBatchingManagerV2();

import type { AppEnv } from "@autumn/shared";
import { logger } from "@/external/logtail/logtailUtils.js";
import { currentRegion } from "@/external/redis/initRedis.js";
import { JobName } from "@/queue/JobName.js";
import { addTaskToQueue } from "@/queue/queueUtils.js";
import type { UsageWindowUpdate } from "../types/usageWindowUpdate.js";

interface CustomerBatchContext {
	customerId: string;
	orgId: string;
	env: AppEnv;
	region: string;
	timestamp: number;
	cusEntIds: Set<string>;
	rolloverIds: Set<string>;
	entityId?: string;
	modifiedCusEntIdsByFeatureId: Record<string, string[]>;
	// Counter SNAPSHOTS keyed by capped feature: each deduction returns the
	// complete post-deduction array, so merging across batched items is
	// last-write-wins (unlike cusEnt/rollover ids, which accumulate).
	usageWindowUpdatesByFeatureId: Record<string, UsageWindowUpdate>;
}

interface CustomerBatch {
	context: CustomerBatchContext;
	timer: NodeJS.Timeout | null;
}

export type QueueSyncV4Payload = {
	jobName: string;
	payload: {
		customerId: string;
		orgId: string;
		env: AppEnv;
		region: string;
		timestamp: number;
		cusEntIds: string[];
		rolloverIds: string[];
		entityId?: string;
		modifiedCusEntIdsByFeatureId: Record<string, string[]>;
		usageWindowUpdates?: UsageWindowUpdate[];
	};
	messageGroupId?: string;
	messageDeduplicationId: string;
};

/**
 * Batches v4 sync jobs per customer using a fixed tumbling window.
 * Always requires modifiedCusEntIdsByFeatureId — never mixes with v3 sync items.
 */
export class SyncBatchingManagerV3 {
	private customerBatches: Map<string, CustomerBatch> = new Map();

	private readonly BATCH_WINDOW_MS: number = 1000;
	private readonly MAX_BATCH_SIZE = 1000;
	private readonly DEDUP_BUCKET_MS: number = 2500;

	private readonly _addTaskToQueue: (args: QueueSyncV4Payload) => Promise<void>;

	constructor({
		addTaskToQueueFn,
		batchWindowMs,
		dedupBucketMs,
	}: {
		addTaskToQueueFn?: (args: QueueSyncV4Payload) => Promise<void>;
		batchWindowMs?: number;
		dedupBucketMs?: number;
	} = {}) {
		this._addTaskToQueue =
			addTaskToQueueFn ??
			(addTaskToQueue as unknown as (
				args: QueueSyncV4Payload,
			) => Promise<void>);
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
		entityId,
		modifiedCusEntIdsByFeatureId,
		usageWindowUpdates,
	}: {
		customerId: string;
		orgId: string;
		env: AppEnv;
		cusEntIds: string[];
		rolloverIds?: string[];
		region?: string;
		entityId?: string;
		modifiedCusEntIdsByFeatureId: Record<string, string[]>;
		usageWindowUpdates?: UsageWindowUpdate[];
	}): void {
		const batchKey = this.buildBatchKey({ orgId, env, customerId });
		let batch = this.customerBatches.get(batchKey);

		if (!batch) {
			batch = this.createBatch({ customerId, orgId, env, region });
			this.customerBatches.set(batchKey, batch);
			this.scheduleCustomerBatch({ batchKey });
		}

		this.mergeCusEntIds({ batch, cusEntIds });
		this.mergeRolloverIds({ batch, rolloverIds: rolloverIds ?? [] });

		if (region) batch.context.region = region;
		if (entityId) batch.context.entityId = entityId;

		for (const [featureId, ids] of Object.entries(
			modifiedCusEntIdsByFeatureId,
		)) {
			if (!batch.context.modifiedCusEntIdsByFeatureId[featureId]) {
				batch.context.modifiedCusEntIdsByFeatureId[featureId] = [];
			}
			batch.context.modifiedCusEntIdsByFeatureId[featureId].push(...ids);
		}

		for (const usageWindowUpdate of usageWindowUpdates ?? []) {
			batch.context.usageWindowUpdatesByFeatureId[
				usageWindowUpdate.feature_id
			] = usageWindowUpdate;
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
				modifiedCusEntIdsByFeatureId: {},
				usageWindowUpdatesByFeatureId: {},
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
		if (
			context.cusEntIds.size === 0 &&
			context.rolloverIds.size === 0 &&
			Object.keys(context.usageWindowUpdatesByFeatureId).length === 0
		) {
			return;
		}

		await this.queueSyncJob({ context });
	}

	private clearBatchTimer({ batch }: { batch: CustomerBatch }): void {
		if (batch.timer) {
			clearTimeout(batch.timer);
			batch.timer = null;
		}
	}

	private buildDeduplicationId({
		context,
		cusEntIds,
		rolloverIds,
		usageWindowUpdates,
	}: {
		context: CustomerBatchContext;
		cusEntIds: string[];
		rolloverIds: string[];
		usageWindowUpdates: UsageWindowUpdate[];
	}): string {
		const dedupBucket = Math.floor(Date.now() / this.DEDUP_BUCKET_MS);
		const dedupKey = JSON.stringify({
			jobName: JobName.SyncBalanceBatchV4,
			orgId: context.orgId,
			env: context.env,
			customerId: context.customerId,
			cusEntIds,
			rolloverIds,
			// Snapshots ride the payload (cusEnt balances are re-read at consume
			// time, counters are not), so a newer snapshot must never be dropped
			// as a duplicate of an older one within the bucket.
			usageWindowUpdates,
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
		const usageWindowUpdates = Object.values(
			context.usageWindowUpdatesByFeatureId,
		);
		const messageDeduplicationId = this.buildDeduplicationId({
			context,
			cusEntIds,
			rolloverIds,
			usageWindowUpdates,
		});

		try {
			await this._addTaskToQueue({
				jobName: JobName.SyncBalanceBatchV4,
				payload: {
					customerId: context.customerId,
					orgId: context.orgId,
					env: context.env,
					region: context.region,
					timestamp: Date.now(),
					cusEntIds,
					rolloverIds,
					entityId: context.entityId,
					modifiedCusEntIdsByFeatureId: context.modifiedCusEntIdsByFeatureId,
					usageWindowUpdates,
				},
				// messageGroupId: `sync-v4:${context.orgId}:${context.env}:${context.customerId}`,
				messageDeduplicationId,
			});

			logger.debug(
				`[SyncV4] Queued sync for ${context.customerId}, ${cusEntIds.length} entitlements, ${rolloverIds.length} rollovers, ${usageWindowUpdates.length} usage windows`,
			);
		} catch (error) {
			logger.error(
				`[SyncV4] Failed to queue sync for ${context.customerId}: ${error}`,
			);
		}
	}
}

export const globalSyncBatchingManagerV3 = new SyncBatchingManagerV3();

import type { AppEnv } from "@autumn/shared";
import { logger } from "@/external/logtail/logtailUtils.js";
import { currentRegion } from "@/external/redis/initRedis.js";
import { JobName } from "@/queue/JobName.js";
import { addTaskToQueue } from "@/queue/queueUtils.js";
import { generateId } from "@/utils/genUtils.js";

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

/**
 * Batching manager for syncing FullCustomer cache to PostgreSQL.
 * Batches by customer, collects modified cusEntIds within a time window.
 */
class SyncBatchingManagerV2 {
	private customerBatches: Map<string, CustomerBatch> = new Map();

	private readonly BATCH_WINDOW_MS =
		process.env.NODE_ENV === "development" ? 1000 : 5000;
	private readonly MAX_BATCH_SIZE = 1000;

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
		}

		this.mergeCusEntIds({ batch, cusEntIds });
		this.mergeRolloverIds({ batch, rolloverIds: rolloverIds ?? [] });
		batch.context.timestamp = Date.now();
		if (region) {
			batch.context.region = region;
		}

		const totalSize =
			batch.context.cusEntIds.size + batch.context.rolloverIds.size;
		if (totalSize >= this.MAX_BATCH_SIZE) {
			this.executeCustomerBatch({ batchKey });
			return;
		}

		this.scheduleCustomerBatch({ batchKey });
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

		this.clearBatchTimer({ batch });

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

	private async queueSyncJob({
		context,
	}: {
		context: CustomerBatchContext;
	}): Promise<void> {
		const cusEntIds = Array.from(context.cusEntIds).sort();
		const rolloverIds = Array.from(context.rolloverIds).sort();
		const timestamp = Date.now();
		const messageDeduplicationId = this.getMessageDeduplicationId({
			context,
			cusEntIds,
			rolloverIds,
			timestamp,
		});

		try {
			await addTaskToQueue({
				jobName: JobName.SyncBalanceBatchV3,
				payload: {
					customerId: context.customerId,
					orgId: context.orgId,
					env: context.env,
					region: context.region,
					timestamp,
					cusEntIds,
					rolloverIds,
				},
				messageGroupId: generateId("msg"),
				messageDeduplicationId,
				generateDeduplicationId: false,
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

	private getMessageDeduplicationId({
		context,
		cusEntIds,
		rolloverIds,
		timestamp,
	}: {
		context: CustomerBatchContext;
		cusEntIds: string[];
		rolloverIds: string[];
		timestamp: number;
	}): string {
		const dedupBucket = Math.floor(timestamp / this.BATCH_WINDOW_MS);
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
}

export const globalSyncBatchingManagerV2 = new SyncBatchingManagerV2();

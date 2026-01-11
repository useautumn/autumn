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
}

interface CustomerBatch {
	context: CustomerBatchContext;
	timer: NodeJS.Timeout | null;
}

/**
 * Batching manager for syncing FullCustomer cache to PostgreSQL.
 * Batches by customer, collects modified cusEntIds within a time window.
 */
export class SyncBatchingManagerV2 {
	private customerBatches: Map<string, CustomerBatch> = new Map();

	private readonly BATCH_WINDOW_MS =
		process.env.NODE_ENV === "development" ? 500 : 1000;
	private readonly MAX_BATCH_SIZE = 1000;

	addSyncItem({
		customerId,
		orgId,
		env,
		cusEntIds,
		region,
	}: {
		customerId: string;
		orgId: string;
		env: AppEnv;
		cusEntIds: string[];
		region?: string;
	}): void {
		const batchKey = this.buildBatchKey({ orgId, env, customerId });
		let batch = this.customerBatches.get(batchKey);

		if (!batch) {
			batch = this.createBatch({ customerId, orgId, env, region });
			this.customerBatches.set(batchKey, batch);
			this.scheduleCustomerBatch({ batchKey });
		}

		this.mergeCusEntIds({ batch, cusEntIds });

		if (batch.context.cusEntIds.size >= this.MAX_BATCH_SIZE) {
			this.executeCustomerBatch({ batchKey });
		}
	}

	getStats(): { totalCustomers: number; totalPendingEntitlements: number } {
		let totalEntitlements = 0;
		for (const batch of this.customerBatches.values()) {
			totalEntitlements += batch.context.cusEntIds.size;
		}
		return {
			totalCustomers: this.customerBatches.size,
			totalPendingEntitlements: totalEntitlements,
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

	private scheduleCustomerBatch({ batchKey }: { batchKey: string }): void {
		const batch = this.customerBatches.get(batchKey);
		if (!batch) return;

		batch.timer = setTimeout(() => {
			this.executeCustomerBatch({ batchKey });
		}, this.BATCH_WINDOW_MS);
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
		if (context.cusEntIds.size === 0) return;

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
		try {
			const dedupHash = this.buildDeduplicationHash({ context });

			await addTaskToQueue({
				jobName: JobName.SyncBalanceBatchV3,
				payload: {
					orgId: context.orgId,
					env: context.env,
					customerId: context.customerId,
					item: {
						customerId: context.customerId,
						orgId: context.orgId,
						env: context.env,
						region: context.region,
						timestamp: context.timestamp,
						cusEntIds: Array.from(context.cusEntIds),
					},
				},
				messageGroupId: context.customerId,
				messageDeduplicationId: dedupHash,
			});

			logger.info(
				`[SyncV3] Queued sync for ${context.customerId}, ${context.cusEntIds.size} entitlements`,
			);
		} catch (error) {
			logger.error(
				`[SyncV3] Failed to queue sync for ${context.customerId}: ${error}`,
			);
		}
	}

	private buildDeduplicationHash({
		context,
	}: {
		context: CustomerBatchContext;
	}): string {
		const dedupKey = `${context.orgId}:${context.env}:${context.customerId}`;
		const dedupTimestamp = Math.floor(Date.now() / 10);
		return Bun.hash(`${dedupKey}:${dedupTimestamp}`).toString(36);
	}
}

export const globalSyncBatchingManagerV2 = new SyncBatchingManagerV2();

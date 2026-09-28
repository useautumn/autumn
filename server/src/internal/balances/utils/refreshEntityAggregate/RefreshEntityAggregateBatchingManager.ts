import type { AppEnv } from "@autumn/shared";
import { logger } from "@/external/logtail/logtailUtils.js";
import { currentRegion } from "@/external/redis/initRedis.js";
import { JobName } from "@/queue/JobName.js";
import { addTaskToQueue } from "@/queue/queueUtils.js";
import {
	buildRefreshEntityAggregateDedupId,
	REFRESH_ENTITY_AGGREGATE_DEDUP_BUCKET_MS,
	REFRESH_ENTITY_AGGREGATE_SETTLE_BUFFER_MS,
} from "./queueRefreshEntityAggregate.js";

export type QueueRefreshEntityAggregatePayload = {
	jobName: string;
	payload: {
		customerId: string;
		orgId: string;
		env: AppEnv;
		region: string;
		internalFeatureIds: string[];
	};
	messageGroupId: string;
	messageDeduplicationId: string;
};

interface RefreshEntry {
	customerId: string;
	orgId: string;
	env: AppEnv;
	internalFeatureIds: Set<string>;
	timer: NodeJS.Timeout | null;
}

/**
 * Coalesces `RefreshEntityAggregate` enqueues per (org, env, customer).
 *
 * All `schedule()` calls that arrive inside the same 5s bucket share one
 * timer aimed at the bucket's trailing edge (+ settle buffer). When the timer
 * fires, the manager emits a single SQS message with the merged
 * `internalFeatureIds`. Because we're in the same worker process that
 * consumes the customer's sync-v4 stream (FIFO MessageGroupId already
 * serializes that), this in-memory dedup is effectively per-customer global.
 */
export class RefreshEntityAggregateBatchingManager {
	private entries: Map<string, RefreshEntry> = new Map();

	private readonly bucketMs: number;
	private readonly settleBufferMs: number;

	private readonly _addTaskToQueue: (
		args: QueueRefreshEntityAggregatePayload,
	) => Promise<void>;
	private readonly _now: () => number;

	constructor({
		addTaskToQueueFn,
		bucketMs,
		settleBufferMs,
		now,
	}: {
		addTaskToQueueFn?: (
			args: QueueRefreshEntityAggregatePayload,
		) => Promise<void>;
		bucketMs?: number;
		settleBufferMs?: number;
		now?: () => number;
	} = {}) {
		this._addTaskToQueue =
			addTaskToQueueFn ??
			(addTaskToQueue as unknown as (
				args: QueueRefreshEntityAggregatePayload,
			) => Promise<void>);
		this.bucketMs = bucketMs ?? REFRESH_ENTITY_AGGREGATE_DEDUP_BUCKET_MS;
		this.settleBufferMs =
			settleBufferMs ?? REFRESH_ENTITY_AGGREGATE_SETTLE_BUFFER_MS;
		this._now = now ?? Date.now;
	}

	schedule({
		orgId,
		env,
		customerId,
		internalFeatureIds,
	}: {
		orgId: string;
		env: AppEnv;
		customerId: string;
		internalFeatureIds: string[];
	}): void {
		const key = this.buildKey({ orgId, env, customerId });
		const existing = this.entries.get(key);
		if (existing) {
			for (const id of internalFeatureIds) {
				existing.internalFeatureIds.add(id);
			}
			return;
		}

		const entry: RefreshEntry = {
			customerId,
			orgId,
			env,
			internalFeatureIds: new Set(internalFeatureIds),
			timer: null,
		};
		this.entries.set(key, entry);
		this.scheduleTimer({ key, entry });
	}

	async flush(): Promise<void> {
		const keys = Array.from(this.entries.keys());
		await Promise.all(keys.map((key) => this.fire({ key })));
	}

	getStats(): { totalPending: number } {
		return { totalPending: this.entries.size };
	}

	private buildKey({
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

	private scheduleTimer({
		key,
		entry,
	}: {
		key: string;
		entry: RefreshEntry;
	}): void {
		const nowMs = this._now();
		const bucketEndMs =
			(Math.floor(nowMs / this.bucketMs) + 1) * this.bucketMs;
		const delayMs = bucketEndMs - nowMs + this.settleBufferMs;

		entry.timer = setTimeout(() => {
			this.fire({ key });
		}, delayMs);

		if (entry.timer.unref) entry.timer.unref();
	}

	private async fire({ key }: { key: string }): Promise<void> {
		const entry = this.entries.get(key);
		if (!entry) return;

		if (entry.timer) {
			clearTimeout(entry.timer);
			entry.timer = null;
		}
		this.entries.delete(key);

		if (entry.internalFeatureIds.size === 0) return;

		const internalFeatureIds = Array.from(entry.internalFeatureIds).sort();
		const messageDeduplicationId = buildRefreshEntityAggregateDedupId({
			orgId: entry.orgId,
			env: entry.env,
			customerId: entry.customerId,
			nowMs: this._now(),
			bucketMs: this.bucketMs,
		});

		try {
			await this._addTaskToQueue({
				jobName: JobName.RefreshEntityAggregate,
				payload: {
					customerId: entry.customerId,
					orgId: entry.orgId,
					env: entry.env,
					region: currentRegion,
					internalFeatureIds,
				},
				messageGroupId: `refresh-agg:${entry.orgId}:${entry.env}:${entry.customerId}`,
				messageDeduplicationId,
			});

			logger.info(
				`[RefreshEntityAggregate] Queued refresh for ${entry.customerId}, ${internalFeatureIds.length} features`,
			);
		} catch (error) {
			logger.error(
				`[RefreshEntityAggregate] Failed to queue refresh for ${entry.customerId}: ${error}`,
			);
		}
	}
}

export const globalRefreshEntityAggregateBatchingManager =
	new RefreshEntityAggregateBatchingManager();

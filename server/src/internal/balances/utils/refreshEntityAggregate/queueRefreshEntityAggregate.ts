import type { AppEnv } from "@autumn/shared";
import { JobName } from "@/queue/JobName.js";

export const REFRESH_ENTITY_AGGREGATE_DEDUP_BUCKET_MS =
	process.env.NODE_ENV === "development" ? 1000 : 5000;

/**
 * Buffer added after the bucket boundary so the trailing enqueue fires *after*
 * the final sync batch of the bucket has settled into Postgres.
 * `SyncBatchingManagerV3` uses a 1s tumbling window, so 1.5s is enough.
 */
export const REFRESH_ENTITY_AGGREGATE_SETTLE_BUFFER_MS = 1500;

/**
 * Deterministic dedup id per (org, env, customer) within a time bucket.
 * Rapid schedules inside the same bucket collapse to a single SQS message.
 */
export const buildRefreshEntityAggregateDedupId = ({
	orgId,
	env,
	customerId,
	nowMs,
	bucketMs = REFRESH_ENTITY_AGGREGATE_DEDUP_BUCKET_MS,
}: {
	orgId: string;
	env: AppEnv;
	customerId: string;
	nowMs: number;
	bucketMs?: number;
}): string => {
	const bucket = Math.floor(nowMs / bucketMs);
	const key = JSON.stringify({
		jobName: JobName.RefreshEntityAggregate,
		orgId,
		env,
		customerId,
		bucket,
	});
	return Bun.hash(key).toString();
};

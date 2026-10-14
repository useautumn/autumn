import type { AppEnv } from "@autumn/shared";
import { JobName } from "@/queue/JobName.js";

export const REFRESH_ENTITY_AGGREGATE_DEDUP_BUCKET_MS =
	process.env.NODE_ENV === "development" ? 1000 : 5000;

export const REFRESH_ENTITY_AGGREGATE_SETTLE_BUFFER_MS = 1500;

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

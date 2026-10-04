import type { SharedCheckLeases } from "@autumn/balance-worker-client";
import { getMiscRedis } from "@/external/redis/miscCache/getMiscRedis.js";
import { runRedisOp } from "@/external/redis/utils/runRedisOp.js";

/** A shared lease only saves an owner round trip (~ms); past this the check asks the owner instead. */
const SHARED_LEASE_READ_TIMEOUT_MS = 50;
const SHARED_LEASE_WRITE_TIMEOUT_MS = 200;

async function readSharedLease({
	key,
}: {
	key: string;
}): Promise<{ value: string; ttlMs: number } | null> {
	const results = await runRedisOp({
		operation: (redis) => redis.pipeline().get(key).pttl(key).exec(),
		source: "balance-worker:check-lease:read",
		redisInstance: getMiscRedis(),
		timeoutMs: SHARED_LEASE_READ_TIMEOUT_MS,
	});
	const [value, ttl] = results ?? [];
	if (value?.[0] || ttl?.[0]) throw value?.[0] ?? ttl?.[0];
	if (typeof value?.[1] !== "string" || typeof ttl?.[1] !== "number")
		return null;
	return { value: value[1], ttlMs: ttl[1] };
}

async function writeSharedLease({
	key,
	value,
	ttlMs,
}: {
	key: string;
	value: string;
	ttlMs: number;
}): Promise<void> {
	await runRedisOp({
		operation: (redis) => redis.set(key, value, "PX", ttlMs),
		source: "balance-worker:check-lease:write",
		redisInstance: getMiscRedis(),
		timeoutMs: SHARED_LEASE_WRITE_TIMEOUT_MS,
	});
}

/** Leased check replies on the misc Redis, so one owner call answers every server process until its deadline. */
export const sharedCheckLeasesOnMiscRedis: SharedCheckLeases = {
	read: readSharedLease,
	write: writeSharedLease,
};

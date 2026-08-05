import type { Redis } from "ioredis";
import { getActiveMiscRedisInstanceName } from "@/internal/misc/edgeConfigs/miscRedisConfig/miscRedisConfigStore.js";
import { tryRedisOp } from "../utils/runRedisOp.js";
import { getMiscRedisTargets } from "./resolveMiscRedis.js";

const setOnTarget = ({
	redis,
	key,
	value,
	ttlMs,
	source,
	onError,
}: {
	redis: Redis;
	key: string;
	value: string;
	ttlMs: number;
	source: string;
	onError?: (error: unknown) => void;
}) =>
	tryRedisOp({
		operation: () => redis.set(key, value, "PX", ttlMs),
		source,
		redisInstance: redis,
		onError,
	});

/** Write-through for coordination keys (locks/reservations): the same SET
 *  lands on every live instance, so a cutover or rollback never drops the key. */
export const setOnMiscRedisTargets = async ({
	key,
	value,
	ttlMs,
	source,
	onError,
}: {
	key: string;
	value: string;
	ttlMs: number;
	source: string;
	onError?: (error: unknown) => void;
}): Promise<void> => {
	await Promise.all(
		getMiscRedisTargets().map(({ redis }) =>
			setOnTarget({ redis, key, value, ttlMs, source, onError }),
		),
	);
};

/** Best-effort, never-throws copy of a won lock to the ramp target — safe to
 *  `void`. The NX decision stays with the active instance; a mirror never votes. */
export const mirrorSetOnMiscRedisRampTarget = async ({
	key,
	value,
	ttlMs,
	source,
}: {
	key: string;
	value: string;
	ttlMs: number;
	source: string;
}): Promise<void> => {
	try {
		const activeInstance = getActiveMiscRedisInstanceName();
		await Promise.all(
			getMiscRedisTargets()
				.filter((target) => target.instanceName !== activeInstance)
				.map(({ redis }) => setOnTarget({ redis, key, value, ttlMs, source })),
		);
	} catch {
		// Fail open — a missed mirror is bounded by the lock TTL.
	}
};

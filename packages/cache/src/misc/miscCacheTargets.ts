import type { Redis } from "ioredis";
import { tryRedisOp } from "../ops/runRedisOp.js";
import type { MiscCache, MiscCacheTarget } from "./types/miscCache.js";

type TargetsScope = {
	targets: () => MiscCacheTarget[];
	activeInstanceName: () => MiscCacheTarget["instanceName"];
};

export const forEachTarget = async <T>({
	scope,
	operation,
	onError,
}: {
	scope: TargetsScope;
	operation: (target: MiscCacheTarget) => Promise<T>;
	onError?: (params: { target: MiscCacheTarget; error: unknown }) => void;
}): Promise<PromiseSettledResult<T>[]> =>
	Promise.all(
		scope.targets().map(async (target): Promise<PromiseSettledResult<T>> => {
			try {
				return { status: "fulfilled", value: await operation(target) };
			} catch (error) {
				onError?.({ target, error });
				return { status: "rejected", reason: error };
			}
		}),
	);

/** A flip mid-handoff can leave the value on either side, so every live target is asked in turn. */
export const getFromTargets = async ({
	scope,
	key,
	source,
	onError,
}: { scope: TargetsScope } & Parameters<
	MiscCache["getFromTargets"]
>[0]): Promise<string | null> => {
	for (const { redis } of scope.targets()) {
		const value = await tryRedisOp({
			operation: () => redis.get(key),
			source,
			redisInstance: redis,
			onError,
		});
		if (value) return value;
	}
	return null;
};

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

export const setOnTargets = async ({
	scope,
	key,
	value,
	ttlMs,
	source,
	onError,
}: { scope: TargetsScope } & Parameters<
	MiscCache["setOnTargets"]
>[0]): Promise<void> => {
	await Promise.all(
		scope
			.targets()
			.map(({ redis }) =>
				setOnTarget({ redis, key, value, ttlMs, source, onError }),
			),
	);
};

/** Never throws: a missed mirror is bounded by the lock's TTL. */
export const mirrorSetOnRampTarget = async ({
	scope,
	key,
	value,
	ttlMs,
	source,
}: { scope: TargetsScope } & Parameters<
	MiscCache["mirrorSetOnRampTarget"]
>[0]): Promise<void> => {
	try {
		const activeInstance = scope.activeInstanceName();
		await Promise.all(
			scope
				.targets()
				.filter((target) => target.instanceName !== activeInstance)
				.map(({ redis }) => setOnTarget({ redis, key, value, ttlMs, source })),
		);
	} catch {
		// Fail open.
	}
};

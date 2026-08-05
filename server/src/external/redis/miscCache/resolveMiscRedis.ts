import type { Redis } from "ioredis";
import { logger } from "@/external/logtail/logtailUtils.js";
import type { MiscRedisInstanceName } from "@/internal/misc/edgeConfigs/miscRedisConfig/miscRedisConfigSchemas.js";
import { getMiscRedisConfig } from "@/internal/misc/edgeConfigs/miscRedisConfig/miscRedisConfigStore.js";
import { getMiscRedis } from "./getMiscRedis.js";
import { getMiscBackupRedis, getMiscMainRedis } from "./miscRedisInstances.js";

export const getRequestBucket = ({
	requestId,
}: {
	requestId: string;
}): number => Number(BigInt(Bun.hash(requestId)) % 100n);

/** The ramp always flows toward the instance that is NOT active. */
const getRampTargetRedis = (): Redis | null => {
	const { activeInstance } = getMiscRedisConfig();
	return activeInstance === "main" ? getMiscBackupRedis() : getMiscMainRedis();
};

const requestIsInRampSlice = ({
	requestId,
	percent,
}: {
	requestId: string;
	percent: number;
}): boolean => percent >= 100 || getRequestBucket({ requestId }) < percent;

let warnedUnroutableRampTarget = false;

const rampTargetOrActive = (): Redis => {
	const rampTarget = getRampTargetRedis();
	if (rampTarget) return rampTarget;

	if (!warnedUnroutableRampTarget) {
		warnedUnroutableRampTarget = true;
		logger.error(
			"[miscRedis] ramp target is not configured/decryptable; routing to the active instance",
		);
	}
	return getMiscRedis();
};

/**
 * Misc-cache client for read-through caches: a `percent` slice of requests
 * (bucketed on requestId) reads from the ramp target. Only safe for keys
 * where a miss recomputes from the source of truth — cross-request state and
 * locks use `getMiscRedis` instead.
 */
export const resolveMiscRedis = ({
	requestId,
}: {
	requestId?: string;
}): Redis => {
	const { ramp } = getMiscRedisConfig();

	const rampIsLive = ramp !== null && ramp.percent > 0;
	if (!rampIsLive || !requestId) return getMiscRedis();
	if (!requestIsInRampSlice({ requestId, percent: ramp.percent })) {
		return getMiscRedis();
	}

	return rampTargetOrActive();
};

type MiscRedisTarget = {
	instanceName: MiscRedisInstanceName;
	redis: Redis;
};

/**
 * Every instance that may be serving reads: the active instance, plus the
 * ramp target whenever a ramp exists — even at 0%, so invalidations start
 * fanning out before any traffic moves (closes the start-of-ramp race).
 */
export const getMiscRedisTargets = (): MiscRedisTarget[] => {
	const { activeInstance, ramp } = getMiscRedisConfig();

	const active: MiscRedisTarget = {
		instanceName: activeInstance,
		redis: getMiscRedis(),
	};
	if (!ramp) return [active];

	const rampTarget = getRampTargetRedis();
	const rampTargetIsRoutable =
		rampTarget !== null && rampTarget !== active.redis;
	if (!rampTargetIsRoutable) return [active];

	const rampInstanceName: MiscRedisInstanceName =
		activeInstance === "main" ? "backup" : "main";
	return [active, { instanceName: rampInstanceName, redis: rampTarget }];
};

/**
 * Run an action (typically a DEL/invalidation) against every live misc-cache
 * target. Fail-open per instance: one target failing never blocks the others,
 * and failures surface through `onError` + the settled results.
 */
export const forEachMiscRedisTarget = async <T>({
	operation,
	onError,
}: {
	operation: (target: MiscRedisTarget) => Promise<T>;
	onError?: (params: { target: MiscRedisTarget; error: unknown }) => void;
}): Promise<PromiseSettledResult<T>[]> => {
	const targets = getMiscRedisTargets();

	return Promise.all(
		targets.map(async (target): Promise<PromiseSettledResult<T>> => {
			try {
				const value = await operation(target);
				return { status: "fulfilled", value };
			} catch (error) {
				onError?.({ target, error });
				return { status: "rejected", reason: error };
			}
		}),
	);
};

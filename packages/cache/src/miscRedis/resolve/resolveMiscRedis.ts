import type { Redis } from "ioredis";
import { getCacheConfiguration } from "../../configureCache.js";
import type { MiscRedisInstanceName } from "../config/miscRedisConfigSchemas.js";
import {
	getActiveMiscRedisInstanceName,
	getMiscRedisConfig,
} from "../config/miscRedisConfigStore.js";
import { getMiscRedis } from "../getMiscRedis.js";
import {
	getMiscBackupRedis,
	getMiscMainRedis,
} from "../instances/miscRedisInstances.js";

export const getRequestBucket = ({
	requestId,
}: {
	requestId: string;
}): number => Number(BigInt(Bun.hash(requestId)) % 100n);

const getRampTargetRedis = (): Redis | null =>
	getActiveMiscRedisInstanceName() === "main"
		? getMiscBackupRedis()
		: getMiscMainRedis();

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
		getCacheConfiguration().logger.error(
			"[miscRedis] ramp target is not configured/decryptable; routing to active",
		);
	}
	return getMiscRedis();
};

export const resolveMiscRedis = ({
	requestId,
}: {
	requestId?: string;
}): Redis => {
	const { ramp } = getMiscRedisConfig();
	if (!ramp || ramp.percent <= 0 || !requestId) return getMiscRedis();
	return requestIsInRampSlice({ requestId, percent: ramp.percent })
		? rampTargetOrActive()
		: getMiscRedis();
};

export type MiscRedisTarget = {
	instanceName: MiscRedisInstanceName;
	redis: Redis;
};

export const getMiscRedisTargets = (): MiscRedisTarget[] => {
	const { activeInstance, ramp } = getMiscRedisConfig();
	const active = { instanceName: activeInstance, redis: getMiscRedis() };
	if (!ramp) return [active];
	const rampTarget = getRampTargetRedis();
	if (!rampTarget || rampTarget === active.redis) return [active];
	return [
		active,
		{
			instanceName: activeInstance === "main" ? "backup" : "main",
			redis: rampTarget,
		},
	];
};

export const forEachMiscRedisTarget = async <T>({
	operation,
	onError,
}: {
	operation: (target: MiscRedisTarget) => Promise<T>;
	onError?: (params: { target: MiscRedisTarget; error: unknown }) => void;
}): Promise<PromiseSettledResult<T>[]> =>
	Promise.all(
		getMiscRedisTargets().map(async (target) => {
			try {
				return { status: "fulfilled", value: await operation(target) } as const;
			} catch (error) {
				onError?.({ target, error });
				return { status: "rejected", reason: error } as const;
			}
		}),
	);

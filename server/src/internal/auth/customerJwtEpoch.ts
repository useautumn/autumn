import type { Redis } from "ioredis";
import {
	getConfiguredRegions,
	getRegionalRedis,
	redis,
} from "@/external/redis/initRedis.js";
import { tryRedisWrite } from "@/utils/cacheUtils/cacheUtils.js";

/**
 * Stateless revocation state for per-customer JWTs, in Redis only (no DB).
 *
 * `jwt:{org}:{cus}` hash { epoch, refresh_kid }, TTL 24h.
 * - epoch: revocation floor. A token is dead if token.epoch < epoch.
 * - refresh_kid: current refresh-token generation (rotation + reuse detection).
 *
 * The TTL is touched on every mint/refresh so the counter always outlives the
 * longest token referencing it (monotonicity). With absent ⇒ epoch 0, a Redis
 * outage fails OPEN — matching the house posture (check itself fails open then).
 */
const REFRESH_TTL_MS = 24 * 60 * 60 * 1000;

const key = ({ orgId, customerId }: { orgId: string; customerId: string }) =>
	`jwt:${orgId}:${customerId}`;

export type JwtFamily = { epoch: number; refreshKid: number };

/** How many configured regions a write reached. `succeeded === 0` means the
 *  write did not persist anywhere. */
export type RegionWriteResult = { attempted: number; succeeded: number };

/** Hot path. Redis down ⇒ 0 (fail-open: no revocation floor enforced). */
export const readEpoch = async (args: {
	orgId: string;
	customerId: string;
}): Promise<number> => {
	try {
		const value = await redis.hget(key(args), "epoch");
		return value ? Number(value) : 0;
	} catch {
		return 0;
	}
};

export const readFamily = async (args: {
	orgId: string;
	customerId: string;
}): Promise<JwtFamily> => {
	try {
		const hash = await redis.hgetall(key(args));
		return {
			epoch: hash?.epoch ? Number(hash.epoch) : 0,
			refreshKid: hash?.refresh_kid ? Number(hash.refresh_kid) : 0,
		};
	} catch {
		return { epoch: 0, refreshKid: 0 };
	}
};

const writeAllRegions = async (
	run: (r: Redis) => Promise<unknown>,
): Promise<RegionWriteResult> => {
	const regions = getConfiguredRegions();
	const results = await Promise.all(
		regions.map(async (region) => {
			const regional = getRegionalRedis(region);
			if (regional.status !== "ready") {
				return false;
			}
			const result = await tryRedisWrite(() => run(regional), regional);
			return result !== null;
		}),
	);
	return {
		attempted: regions.length,
		succeeded: results.filter(Boolean).length,
	};
};

/** Mint/refresh: persist the family generation and (re)set the 24h TTL. HSET +
 *  PEXPIRE in one MULTI so the key never lingers without a TTL on a crash. */
export const setFamily = async ({
	orgId,
	customerId,
	epoch,
	refreshKid,
}: {
	orgId: string;
	customerId: string;
} & JwtFamily): Promise<RegionWriteResult> => {
	const cacheKey = key({ orgId, customerId });
	return writeAllRegions((r) =>
		r
			.multi()
			.hset(cacheKey, "epoch", String(epoch), "refresh_kid", String(refreshKid))
			.pexpire(cacheKey, REFRESH_TTL_MS)
			.exec(),
	);
};

/** Revoke / reuse-detected: bump the floor so every outstanding token dies. */
export const bumpEpoch = async ({
	orgId,
	customerId,
}: {
	orgId: string;
	customerId: string;
}): Promise<RegionWriteResult> => {
	const cacheKey = key({ orgId, customerId });
	return writeAllRegions((r) =>
		r
			.multi()
			.hincrby(cacheKey, "epoch", 1)
			.pexpire(cacheKey, REFRESH_TTL_MS)
			.exec(),
	);
};

import crypto from "node:crypto";
import type { AppEnv } from "@autumn/shared";
import { getMiscRedis } from "@/external/redis/initRedis.js";
import { tryRedisOp } from "@/external/redis/utils/runRedisOp.js";

const MIGRATION_FILTER_COUNT_PREFIX = "migration_filter_count";
const MIGRATION_FILTER_COUNT_VERSION = "1";

/** Dashboard tolerance: the filter∪processed count moves slowly, and the
 * exact COUNT costs seconds of DB CPU on multi-million-customer orgs. */
export const MIGRATION_FILTER_COUNT_TTL_SECONDS = 60;

export const buildMigrationFilterCountCacheKey = ({
	orgId,
	env,
	countInputs,
}: {
	orgId: string;
	env: AppEnv;
	countInputs: Record<string, unknown>;
}): string => {
	const hash = crypto
		.createHash("md5")
		.update(JSON.stringify(countInputs))
		.digest("hex")
		.slice(0, 16);
	return `${MIGRATION_FILTER_COUNT_PREFIX}:{${orgId}}:${env}:${MIGRATION_FILTER_COUNT_VERSION}:${hash}`;
};

export const getCachedMigrationFilterCount = async ({
	cacheKey,
}: {
	cacheKey: string;
}): Promise<number | null> => {
	const miscRedis = getMiscRedis();
	const cached = await tryRedisOp({
		operation: () => miscRedis.get(cacheKey),
		source: "migration-filter-count-cache:get",
		redisInstance: miscRedis,
	});
	if (cached === null || cached === undefined) return null;

	const count = Number(cached);
	return Number.isFinite(count) ? count : null;
};

export const setCachedMigrationFilterCount = async ({
	cacheKey,
	count,
}: {
	cacheKey: string;
	count: number;
}): Promise<void> => {
	const miscRedis = getMiscRedis();
	await tryRedisOp({
		operation: () =>
			miscRedis.set(
				cacheKey,
				String(count),
				"EX",
				MIGRATION_FILTER_COUNT_TTL_SECONDS,
			),
		source: "migration-filter-count-cache:set",
		redisInstance: miscRedis,
	});
};

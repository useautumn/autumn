import { getMiscRedis } from "@/external/redis/initRedis.js";
import { tryRedisOp } from "@/external/redis/utils/runRedisOp.js";

/** "Cancellation requested" signal for a migration run. Set by the cancel
 *  handler; read by the batch per-item gate and the lazy enqueue/task gates so
 *  in-flight work finishes while no new items start. Best-effort: a degraded
 *  cache makes the gate a no-op. Pinned: cross-request coordination signal. */
const TOKEN_TTL_SECONDS = 3600;

export const buildMigrationCancelTokenKey = (migrationRunId: string) =>
	`migration_run_cancel:${migrationRunId}`;

export const setMigrationCancelRequested = async ({
	migrationRunId,
}: {
	migrationRunId: string;
}): Promise<void> => {
	const miscRedis = getMiscRedis();
	const tokenKey = buildMigrationCancelTokenKey(migrationRunId);

	await tryRedisOp({
		operation: () =>
			miscRedis.set(tokenKey, JSON.stringify(true), "EX", TOKEN_TTL_SECONDS),
		source: "migration-cancel-token:set",
		redisInstance: miscRedis,
	});
};

export const isMigrationCancelRequested = async ({
	migrationRunId,
}: {
	migrationRunId: string;
}): Promise<boolean> => {
	const miscRedis = getMiscRedis();
	const tokenKey = buildMigrationCancelTokenKey(migrationRunId);

	const value = await tryRedisOp({
		operation: () => miscRedis.get(tokenKey),
		source: "migration-cancel-token:get",
		redisInstance: miscRedis,
	});
	return value === "true";
};

export const clearMigrationCancelRequested = async ({
	migrationRunId,
}: {
	migrationRunId: string;
}): Promise<void> => {
	const miscRedis = getMiscRedis();
	const tokenKey = buildMigrationCancelTokenKey(migrationRunId);

	await tryRedisOp({
		operation: () => miscRedis.del(tokenKey),
		source: "migration-cancel-token:clear",
		redisInstance: miscRedis,
	});
};

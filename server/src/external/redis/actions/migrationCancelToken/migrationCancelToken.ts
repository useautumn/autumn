import { getMiscRedis } from "@/external/redis/initRedis.js";
import { tryRedisOp } from "@/external/redis/utils/runRedisOp.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

const TOKEN_TTL_SECONDS = 3600;

export const buildMigrationCancelTokenKey = (migrationRunId: string) =>
	`migration_run_cancel:${migrationRunId}`;

export const setMigrationCancelRequested = async ({
	ctx,
	migrationRunId,
}: {
	ctx: AutumnContext;
	migrationRunId: string;
}): Promise<void> => {
	const miscRedis = getMiscRedis();
	const tokenKey = buildMigrationCancelTokenKey(migrationRunId);

	await tryRedisOp({
		operation: () =>
			miscRedis.set(tokenKey, JSON.stringify(true), "EX", TOKEN_TTL_SECONDS),
		source: "migration-cancel-token:set",
		redisInstance: miscRedis,
		onError: (error) =>
			ctx.logger.warn("[migrationCancelToken] set failed", {
				data: { migrationRunId },
				error,
			}),
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
	ctx,
	migrationRunId,
}: {
	ctx: AutumnContext;
	migrationRunId: string;
}): Promise<void> => {
	const miscRedis = getMiscRedis();
	const tokenKey = buildMigrationCancelTokenKey(migrationRunId);

	await tryRedisOp({
		operation: () => miscRedis.del(tokenKey),
		source: "migration-cancel-token:clear",
		redisInstance: miscRedis,
		onError: (error) =>
			ctx.logger.warn("[migrationCancelToken] clear failed", {
				data: { migrationRunId },
				error,
			}),
	});
};

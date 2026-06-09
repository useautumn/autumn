import { CacheManager } from "@/utils/cacheUtils/CacheManager.js";

/** "Cancellation requested" signal for a migration run. Set by the cancel
 *  handler; read by the batch per-item gate and the lazy enqueue/task gates so
 *  in-flight work finishes while no new items start. Best-effort: a degraded
 *  cache makes the gate a no-op. */
const TOKEN_TTL_SECONDS = 3600;

const cancelTokenKey = (migrationRunId: string) =>
	`migration_run_cancel:${migrationRunId}`;

export const setMigrationCancelRequested = async ({
	migrationRunId,
}: {
	migrationRunId: string;
}): Promise<void> => {
	await CacheManager.setJson(cancelTokenKey(migrationRunId), true, TOKEN_TTL_SECONDS);
};

export const isMigrationCancelRequested = async ({
	migrationRunId,
}: {
	migrationRunId: string;
}): Promise<boolean> => {
	const value = await CacheManager.getJson<boolean>(
		cancelTokenKey(migrationRunId),
	);
	return value === true;
};

export const clearMigrationCancelRequested = async ({
	migrationRunId,
}: {
	migrationRunId: string;
}): Promise<void> => {
	await CacheManager.del(cancelTokenKey(migrationRunId));
};

import { Scopes } from "@autumn/shared";
import { getMiscBackupRedis } from "@/external/redis/initRedis.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { toLegacyMiscRedisInstanceName } from "@/internal/misc/edgeConfigs/miscRedisConfig/miscRedisConfigSchemas.js";
import {
	getActiveMiscRedisInstanceName,
	getMiscRedisConfigStatus,
} from "@/internal/misc/edgeConfigs/miscRedisConfig/miscRedisConfigStore.js";

/** Legacy route kept for the current admin UI — reports instance names in the
 *  old primary/fallback vocabulary. New tooling uses /misc-redis-config. */
export const handleGetAdminMainRedisCacheConfig = createRoute({
	scopes: [Scopes.Superuser],
	handler: async (c) => {
		const status = getMiscRedisConfigStatus();
		const backup = getMiscBackupRedis();

		return c.json({
			activeInstance: toLegacyMiscRedisInstanceName(
				getActiveMiscRedisInstanceName(),
			),
			fallbackConfigured: Boolean(backup),
			fallbackStatus: backup?.status ?? "not_configured",
			configHealthy: status.healthy,
			configConfigured: status.configured,
			lastSuccessAt: status.lastSuccessAt ?? null,
			error: status.error ?? null,
		});
	},
});

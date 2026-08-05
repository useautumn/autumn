import { ErrCode, RecaseError, Scopes } from "@autumn/shared";
import { z } from "zod/v4";
import { getMiscBackupRedis } from "@/external/redis/initRedis.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { MiscRedisConfigSchema } from "@/internal/misc/miscRedisConfig/miscRedisConfigSchemas.js";
import { setActiveMiscRedisInstance } from "@/internal/misc/miscRedisConfig/miscRedisConfigStore.js";

/** Legacy route kept for API compat — accepts the old primary/fallback
 *  vocabulary alongside main/backup. Flipping always clears any ramp. */
export const handleUpsertAdminMainRedisCacheConfig = createRoute({
	scopes: [Scopes.Superuser],
	body: z.object({
		activeInstance: MiscRedisConfigSchema.shape.activeInstance,
	}),
	handler: async (c) => {
		const { activeInstance } = c.req.valid("json");

		if (activeInstance === "backup") {
			const backup = getMiscBackupRedis();
			if (!backup) {
				throw new RecaseError({
					message: "No backup connection is configured",
					code: ErrCode.InvalidRequest,
					statusCode: 503,
				});
			}

			const pong = await backup.ping().catch(() => null);
			if (pong !== "PONG") {
				throw new RecaseError({
					message: "Backup Redis did not respond to its readiness check",
					code: ErrCode.InvalidRequest,
					statusCode: 503,
				});
			}
		}

		await setActiveMiscRedisInstance({ activeInstance });
		return c.json({ success: true, activeInstance });
	},
});

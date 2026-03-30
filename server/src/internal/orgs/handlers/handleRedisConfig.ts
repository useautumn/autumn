import { ErrCode, RecaseError } from "@autumn/shared";
import { z } from "zod/v4";
import { getOrgRedis, removeOrgRedis } from "@/external/redis/orgRedisPool.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { encryptData } from "@/utils/encryptUtils.js";
import { OrgService } from "../OrgService.js";

/** Create a dedicated Redis connection for this org. Rejects if redis_config already exists. */
export const handleUpsertRedisConfig = createRoute({
	body: z.object({
		connectionString: z.string().min(1),
	}),
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { db, org, logger } = ctx;
		const { connectionString } = c.req.valid("json");

		if (org.redis_config) {
			throw new RecaseError({
				message:
					"Redis config already exists. Remove it first before creating a new one.",
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}

		let url: string;
		try {
			url = new URL(connectionString).hostname;
		} catch {
			throw new RecaseError({
				message: "Invalid connection string: could not parse URL",
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}

		const encryptedConnectionString = encryptData(connectionString);
		const now = Date.now();

		const updatedOrg = await OrgService.update({
			db,
			orgId: org.id,
			updates: {
				redis_config: {
					connectionString: encryptedConnectionString,
					url,
					migrationPercent: 0,
					previousMigrationPercent: 0,
					migrationChangedAt: now,
				},
			},
		});

		if (updatedOrg) {
			getOrgRedis({ org: updatedOrg });
			logger.info(
				`[handleUpsertRedisConfig] org=${org.id}: redis_config created, url=${url}`,
			);
		}

		return c.json({ success: true });
	},
});

/** Update migration percentage for gradual rollout/rollback. */
export const handleUpdateRedisMigration = createRoute({
	body: z.object({
		migrationPercent: z.number().min(0).max(100),
	}),
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { db, org, logger } = ctx;
		const { migrationPercent } = c.req.valid("json");

		if (!org.redis_config) {
			throw new RecaseError({
				message: "No redis_config set on this org",
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}

		const updatedOrg = await OrgService.update({
			db,
			orgId: org.id,
			updates: {
				redis_config: {
					...org.redis_config,
					previousMigrationPercent: org.redis_config.migrationPercent,
					migrationPercent,
					migrationChangedAt: Date.now(),
				},
			},
		});

		if (updatedOrg) {
			logger.info(
				`[handleUpdateRedisMigration] org=${org.id}: ${org.redis_config.migrationPercent}% -> ${migrationPercent}%`,
			);
		}

		return c.json({ success: true });
	},
});

/** Remove dedicated Redis connection. Only allowed when migrationPercent is 0. */
export const handleDeleteRedisConfig = createRoute({
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { db, org, logger } = ctx;

		if (org.redis_config && org.redis_config.migrationPercent > 0) {
			throw new RecaseError({
				message: `Cannot remove redis_config while migrationPercent is ${org.redis_config.migrationPercent}%. Set it to 0 first.`,
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}

		await OrgService.update({
			db,
			orgId: org.id,
			updates: { redis_config: null },
		});

		removeOrgRedis({ orgId: org.id });

		logger.info(
			`[handleDeleteRedisConfig] org=${org.id}: redis_config removed`,
		);

		return c.json({ success: true });
	},
});

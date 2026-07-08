import { ErrCode, RecaseError, Scopes } from "@autumn/shared";
import { z } from "zod/v4";
import { getOrgRedis, removeOrgRedis } from "@/external/redis/orgRedisPool.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { encryptData } from "@/utils/encryptUtils.js";
import { OrgService } from "../OrgService.js";
import { clearOrgCache } from "../orgUtils/clearOrgCache.js";

const REDIS_PROTOCOLS = new Set(["redis:", "rediss:"]);

export const handleUpsertRedisConfig = createRoute({
	scopes: [Scopes.Organisation.Write],
	body: z.object({
		connectionString: z.string().min(1),
		publicConnectionString: z.string().min(1).optional(),
	}),
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { db, org, logger } = ctx;
		const {
			connectionString: rawConnectionString,
			publicConnectionString: rawPublicConnectionString,
		} = c.req.valid("json");
		const connectionString = rawConnectionString.trim();
		const publicConnectionString = rawPublicConnectionString?.trim();

		if (!connectionString) {
			throw new RecaseError({
				message: "Connection string is required",
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}

		if (org.redis_config) {
			throw new RecaseError({
				message:
					"Redis config already exists. Remove it before creating a new one.",
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}

		let redisUrl: URL;
		try {
			redisUrl = new URL(connectionString);
		} catch {
			throw new RecaseError({
				message: "Invalid connection string: could not parse URL",
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}
		if (!REDIS_PROTOCOLS.has(redisUrl.protocol)) {
			throw new RecaseError({
				message: "Invalid connection string: expected redis:// or rediss://",
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}

		if (publicConnectionString) {
			let publicRedisUrl: URL;
			try {
				publicRedisUrl = new URL(publicConnectionString);
			} catch {
				throw new RecaseError({
					message: "Invalid public connection string: could not parse URL",
					code: ErrCode.InvalidRequest,
					statusCode: 400,
				});
			}
			if (!REDIS_PROTOCOLS.has(publicRedisUrl.protocol)) {
				throw new RecaseError({
					message:
						"Invalid public connection string: expected redis:// or rediss://",
					code: ErrCode.InvalidRequest,
					statusCode: 400,
				});
			}
		}

		const now = Date.now();
		const updatedOrg = await OrgService.update({
			db,
			orgId: org.id,
			updates: {
				redis_config: {
					connectionString: encryptData(connectionString),
					publicConnectionString: publicConnectionString
						? encryptData(publicConnectionString)
						: undefined,
					url: redisUrl.host,
					migrationPercent: 0,
					previousMigrationPercent: 0,
					migrationChangedAt: now,
				},
			},
		});

		if (updatedOrg) {
			getOrgRedis({ org: updatedOrg });
			await clearOrgCache({ db, orgId: org.id, env: ctx.env, logger });
			logger.info(
				`[handleUpsertRedisConfig] org=${org.id}: redis_config created, url=${redisUrl.host}, actor=${ctx.user?.email ?? ctx.userId ?? "unknown"}`,
			);
		}

		return c.json({ success: true });
	},
});

export const handleUpdateRedisMigration = createRoute({
	scopes: [Scopes.Organisation.Write],
	body: z.object({
		migrationPercent: z.number().int().min(0).max(100),
	}),
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { db, org, logger } = ctx;
		const { migrationPercent } = c.req.valid("json");

		if (!org.redis_config) {
			throw new RecaseError({
				message: "No Redis config set on this org",
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}

		await OrgService.update({
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
		await clearOrgCache({ db, orgId: org.id, env: ctx.env, logger });

		logger.info(
			`[handleUpdateRedisMigration] org=${org.id}: ${org.redis_config.migrationPercent}% -> ${migrationPercent}%`,
		);

		return c.json({ success: true });
	},
});

export const handleDeleteRedisConfig = createRoute({
	scopes: [Scopes.Organisation.Write],
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { db, org, logger } = ctx;

		if (org.redis_config && org.redis_config.migrationPercent > 0) {
			throw new RecaseError({
				message: `Cannot remove Redis config while migrationPercent is ${org.redis_config.migrationPercent}%. Set it to 0 first.`,
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}

		// Intended for use after migrationPercent has settled at 0; in-flight
		// requests may still hold the old org config for a short window.
		await OrgService.update({
			db,
			orgId: org.id,
			updates: { redis_config: null },
		});
		await clearOrgCache({ db, orgId: org.id, env: ctx.env, logger });
		removeOrgRedis({ orgId: org.id });

		logger.info(
			`[handleDeleteRedisConfig] org=${org.id}: redis_config removed`,
		);

		return c.json({ success: true });
	},
});

import { ErrCode, RecaseError, Scopes } from "@autumn/shared";
import { z } from "zod/v4";
import { getOrgRedis, removeOrgRedis } from "@/external/redis/orgRedisPool.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { clearOrgCache } from "@/internal/orgs/orgUtils/clearOrgCache.js";
import { encryptData } from "@/utils/encryptUtils.js";

const REDIS_PROTOCOLS = new Set(["redis:", "rediss:"]);

const orgIdParam = z.object({ org_id: z.string().min(1) });

/**
 * GET /admin/orgs/:org_id/redis
 * Returns the org's redis_config in frontend-safe shape (host + percent only).
 */
export const handleGetAdminOrgRedisConfig = createRoute({
	scopes: [Scopes.Superuser],
	params: orgIdParam,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { org_id: orgId } = c.req.param();
		const org = await OrgService.get({ db: ctx.db, orgId });

		return c.json({
			org_id: org.id,
			org_slug: org.slug,
			redis_config: org.redis_config
				? {
						host: org.redis_config.url,
						hasPublicUrl: Boolean(org.redis_config.publicConnectionString),
						migrationPercent: org.redis_config.migrationPercent,
						previousMigrationPercent: org.redis_config.previousMigrationPercent,
						migrationChangedAt: org.redis_config.migrationChangedAt,
					}
				: null,
		});
	},
});

/**
 * PATCH /admin/orgs/:org_id/redis  body: { connectionString }
 * Initial-create the redis_config for the target org. Encrypts connection
 * string, stores host separately, sets migrationPercent: 0.
 */
export const handleUpsertAdminOrgRedisConfig = createRoute({
	scopes: [Scopes.Superuser],
	params: orgIdParam,
	body: z.object({
		connectionString: z.string().min(1),
		publicConnectionString: z.string().min(1).optional(),
	}),
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { db, logger } = ctx;
		const { org_id: orgId } = c.req.param();
		const {
			connectionString: rawConnectionString,
			publicConnectionString: rawPublicConnectionString,
		} = c.req.valid("json");
		const connectionString = rawConnectionString.trim();
		const publicConnectionString = rawPublicConnectionString?.trim();

		const org = await OrgService.get({ db, orgId });

		if (org.redis_config) {
			throw new RecaseError({
				message:
					"Redis config already exists for this org. Remove it before creating a new one.",
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
				`[admin/handleUpsertAdminOrgRedisConfig] org=${org.id}: redis_config created, url=${redisUrl.host}, actor=${ctx.user?.email ?? ctx.userId ?? "unknown"}`,
			);
		}

		return c.json({ success: true });
	},
});

/**
 * PATCH /admin/orgs/:org_id/redis/migration  body: { migrationPercent }
 * Update the migrationPercent field. Stores previous value + timestamp so
 * the staleness primitive (isRedisMigrationCacheStale) can evict entries
 * whose bucket crossed the threshold.
 */
export const handleUpdateAdminOrgRedisMigration = createRoute({
	scopes: [Scopes.Superuser],
	params: orgIdParam,
	body: z.object({ migrationPercent: z.number().int().min(0).max(100) }),
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { db, logger } = ctx;
		const { org_id: orgId } = c.req.param();
		const { migrationPercent } = c.req.valid("json");

		const org = await OrgService.get({ db, orgId });

		if (!org.redis_config) {
			throw new RecaseError({
				message: "No Redis config set on this org. Connect one first.",
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
			`[admin/handleUpdateAdminOrgRedisMigration] org=${org.id}: ${org.redis_config.migrationPercent}% -> ${migrationPercent}%, actor=${ctx.user?.email ?? ctx.userId ?? "unknown"}`,
		);

		return c.json({ success: true });
	},
});

/**
 * DELETE /admin/orgs/:org_id/redis
 * Removes the redis_config entirely. Refuses while migrationPercent > 0
 * to prevent yanking the rug from under in-flight customers.
 */
export const handleDeleteAdminOrgRedisConfig = createRoute({
	scopes: [Scopes.Superuser],
	params: orgIdParam,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { db, logger } = ctx;
		const { org_id: orgId } = c.req.param();

		const org = await OrgService.get({ db, orgId });

		if (org.redis_config && org.redis_config.migrationPercent > 0) {
			throw new RecaseError({
				message: `Cannot remove Redis config while migrationPercent is ${org.redis_config.migrationPercent}%. Set it to 0 first.`,
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}

		await OrgService.update({
			db,
			orgId: org.id,
			updates: { redis_config: null },
		});
		await clearOrgCache({ db, orgId: org.id, env: ctx.env, logger });
		removeOrgRedis({ orgId: org.id });

		logger.info(
			`[admin/handleDeleteAdminOrgRedisConfig] org=${org.id}: redis_config removed, actor=${ctx.user?.email ?? ctx.userId ?? "unknown"}`,
		);

		return c.json({ success: true });
	},
});

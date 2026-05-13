import { ErrCode, RecaseError, Scopes } from "@autumn/shared";
import { z } from "zod/v4";
import { getOrgRedis, removeOrgRedis } from "@/external/redis/orgRedisPool.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { clearOrgCache } from "@/internal/orgs/orgUtils/clearOrgCache.js";
import { encryptData } from "@/utils/encryptUtils.js";

const REDIS_PROTOCOLS = new Set(["redis:", "rediss:"]);

const orgIdParam = z.object({ org_id: z.string().min(1) });
const redisConfigBody = z.object({
	connectionString: z.string().optional(),
	workerConnectionString: z.string().optional(),
});

const parseRedisUrl = ({
	connectionString,
	label,
}: {
	connectionString: string;
	label: string;
}) => {
	try {
		const redisUrl = new URL(connectionString);
		if (!REDIS_PROTOCOLS.has(redisUrl.protocol)) {
			throw new RecaseError({
				message: `Invalid ${label}: expected redis:// or rediss://`,
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}
		return redisUrl;
	} catch (error) {
		if (error instanceof RecaseError) throw error;
		throw new RecaseError({
			message: `Invalid ${label}: could not parse URL`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
};

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
						workerHost: org.redis_config.workerUrl ?? null,
						migrationPercent: org.redis_config.migrationPercent,
						previousMigrationPercent: org.redis_config.previousMigrationPercent,
						migrationChangedAt: org.redis_config.migrationChangedAt,
					}
				: null,
		});
	},
});

/**
 * PATCH /admin/orgs/:org_id/redis
 * Creates redis_config for the target org, or updates endpoints while the
 * migration is still at 0%. Connection strings are encrypted; hosts are stored
 * separately so the frontend can show non-secret routing state.
 */
export const handleUpsertAdminOrgRedisConfig = createRoute({
	scopes: [Scopes.Superuser],
	params: orgIdParam,
	body: redisConfigBody,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { db, logger } = ctx;
		const { org_id: orgId } = c.req.param();
		const {
			connectionString: rawConnectionString,
			workerConnectionString: rawWorkerConnectionString,
		} = c.req.valid("json");
		const connectionString = rawConnectionString?.trim();
		const workerConnectionString = rawWorkerConnectionString?.trim();

		const org = await OrgService.get({ db, orgId });

		if (!org.redis_config && !connectionString) {
			throw new RecaseError({
				message: "Connection string is required",
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}

		if (org.redis_config && org.redis_config.migrationPercent > 0) {
			throw new RecaseError({
				message: `Cannot update Redis endpoints while migrationPercent is ${org.redis_config.migrationPercent}%. Set it to 0 first.`,
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}

		const redisUrl = connectionString
			? parseRedisUrl({
					connectionString,
					label: "connection string",
				})
			: undefined;
		const workerRedisUrl = workerConnectionString
			? parseRedisUrl({
					connectionString: workerConnectionString,
					label: "worker connection string",
				})
			: undefined;

		const now = Date.now();
		const nextConnectionString = connectionString
			? encryptData(connectionString)
			: org.redis_config?.connectionString;
		const nextUrl = redisUrl?.host ?? org.redis_config?.url;

		if (!nextConnectionString || !nextUrl) {
			throw new RecaseError({
				message: "Connection string is required",
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}

		const updatedOrg = await OrgService.update({
			db,
			orgId: org.id,
			updates: {
				redis_config: {
					connectionString: nextConnectionString,
					workerConnectionString: workerConnectionString
						? encryptData(workerConnectionString)
						: org.redis_config?.workerConnectionString,
					url: nextUrl,
					workerUrl: workerRedisUrl?.host ?? org.redis_config?.workerUrl,
					migrationPercent: org.redis_config?.migrationPercent ?? 0,
					previousMigrationPercent:
						org.redis_config?.previousMigrationPercent ?? 0,
					migrationChangedAt: org.redis_config?.migrationChangedAt ?? now,
				},
			},
		});

		if (updatedOrg) {
			getOrgRedis({ org: updatedOrg });
			await clearOrgCache({ db, orgId: org.id, env: ctx.env, logger });
			logger.info(
				`[admin/handleUpsertAdminOrgRedisConfig] org=${org.id}: redis_config upserted, url=${redisUrl?.host ?? org.redis_config?.url}, workerUrl=${workerRedisUrl?.host ?? org.redis_config?.workerUrl ?? "none"}, actor=${ctx.user?.email ?? ctx.userId ?? "unknown"}`,
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

import { ErrCode, RecaseError, Scopes } from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import {
	closeRampDestinationClient,
	getCacheV2RampConfig,
	getRampDestinationRedis,
	removeCacheV2RampConfig,
	updateCacheV2RampMigrationPercent,
	upsertCacheV2RampConnection,
} from "@/internal/misc/cacheV2Ramp/index.js";
import { encryptData } from "@/utils/encryptUtils.js";

const REDIS_PROTOCOLS = new Set(["redis:", "rediss:"]);

const actorString = (ctx: { user?: { email?: string }; userId?: string }) =>
	ctx.user?.email ?? ctx.userId ?? "unknown";

/**
 * GET /admin/cache-v2-ramp
 * Returns the current ramp config in frontend-safe shape (host + percent only).
 * Never echoes the encrypted connectionString.
 */
export const handleGetAdminCacheV2Ramp = createRoute({
	scopes: [Scopes.Superuser],
	handler: async (c) => {
		const config = getCacheV2RampConfig();
		return c.json({
			cache_v2_ramp: config
				? {
						host: config.url,
						migrationPercent: config.migrationPercent,
						previousMigrationPercent: config.previousMigrationPercent,
						migrationChangedAt: config.migrationChangedAt,
					}
				: null,
		});
	},
});

/**
 * PATCH /admin/cache-v2-ramp  body: { connectionString }
 * Upsert the destination. Accepts a PLAINTEXT redis:// or rediss:// URI;
 * server validates the scheme, extracts host:port for logging, encrypts the
 * connection string, and persists. Refuses while migrationPercent > 0.
 */
export const handleUpsertAdminCacheV2Ramp = createRoute({
	scopes: [Scopes.Superuser],
	body: z.object({ connectionString: z.string().min(1) }),
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { logger } = ctx;
		const { connectionString: raw } = c.req.valid("json");
		const connectionString = raw.trim();

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
		if (!redisUrl.host) {
			throw new RecaseError({
				message: "Invalid connection string: missing host",
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}

		// Store enforces "refuse while migrationPercent > 0" atomically against
		// fresh S3 state — no separate handler-level guard against the polled
		// snapshot (which can lag in multi-instance deployments).
		const wasConfigured = !!getCacheV2RampConfig();
		await upsertCacheV2RampConnection({
			connectionString: encryptData(connectionString),
			url: redisUrl.host,
		});

		logger.info(
			`[admin/handleUpsertAdminCacheV2Ramp] ${wasConfigured ? "updated" : "created"}, url=${redisUrl.host}, actor=${actorString(ctx)}`,
		);

		return c.json({ success: true });
	},
});

/**
 * PATCH /admin/cache-v2-ramp/migration  body: { migrationPercent }
 * Updates the percent. Stores previous value + timestamp.
 */
export const handleUpdateAdminCacheV2RampMigration = createRoute({
	scopes: [Scopes.Superuser],
	body: z.object({ migrationPercent: z.number().int().min(0).max(100) }),
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { logger } = ctx;
		const { migrationPercent } = c.req.valid("json");

		// Snapshot the previous percent for logging only; the store enforces
		// "config must exist" atomically against fresh S3 state.
		const previousSnapshot = getCacheV2RampConfig();
		await updateCacheV2RampMigrationPercent({ migrationPercent });

		// Warm the destination client on first ramp-up so the first ramped
		// requests don't pay the connect-handshake latency.
		if (
			migrationPercent > 0 &&
			(previousSnapshot?.migrationPercent ?? 0) === 0
		) {
			getRampDestinationRedis();
		}

		logger.info(
			`[admin/handleUpdateAdminCacheV2RampMigration] ${previousSnapshot?.migrationPercent ?? 0}% -> ${migrationPercent}%, actor=${actorString(ctx)}`,
		);

		return c.json({ success: true });
	},
});

/**
 * DELETE /admin/cache-v2-ramp
 * Removes the cache V2 ramp config entirely. Refuses while migrationPercent > 0.
 */
export const handleDeleteAdminCacheV2Ramp = createRoute({
	scopes: [Scopes.Superuser],
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { logger } = ctx;
		// Store enforces "refuse while migrationPercent > 0" atomically against
		// fresh S3 state.
		await removeCacheV2RampConfig();
		closeRampDestinationClient();

		logger.info(
			`[admin/handleDeleteAdminCacheV2Ramp] removed, actor=${actorString(ctx)}`,
		);

		return c.json({ success: true });
	},
});

import { ErrCode, RecaseError, Scopes } from "@autumn/shared";
import { z } from "zod/v4";
import { getMiscBackupRedis } from "@/external/redis/initRedis.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import {
	clearMiscRedisRamp,
	getMiscRedisConfig,
	getMiscRedisConfigStatus,
	removeMiscRedisBackupConfig,
	startMiscRedisRamp,
	updateMiscRedisRampPercent,
	upsertMiscRedisBackupConnection,
} from "@/internal/misc/miscRedisConfig/miscRedisConfigStore.js";
import { encryptData } from "@/utils/encryptUtils.js";

const REDIS_PROTOCOLS = new Set(["redis:", "rediss:"]);

const actorString = (ctx: { user?: { email?: string }; userId?: string }) =>
	ctx.user?.email ?? ctx.userId ?? "unknown";

const parseRedisConnectionString = (raw: string): URL => {
	let redisUrl: URL;
	try {
		redisUrl = new URL(raw);
	} catch {
		throw new RecaseError({
			message: "Invalid connection string: could not parse URL",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
	if (!REDIS_PROTOCOLS.has(redisUrl.protocol) || !redisUrl.host) {
		throw new RecaseError({
			message:
				"Invalid connection string: expected redis://host or rediss://host",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
	return redisUrl;
};

/**
 * GET /admin/misc-redis-config
 * Full config in frontend-safe shape — never echoes encrypted connection
 * strings.
 */
export const handleGetAdminMiscRedisConfig = createRoute({
	scopes: [Scopes.Superuser],
	handler: async (c) => {
		const config = getMiscRedisConfig();
		const status = getMiscRedisConfigStatus();
		const backupClientReady = getMiscBackupRedis()?.status === "ready";

		return c.json({
			activeInstance: config.activeInstance,
			ramp: config.ramp,
			backup: config.backup
				? {
						host: config.backup.url,
						hasPrivateConnectionString: Boolean(
							config.backup.privateConnectionString,
						),
					}
				: null,
			backupRoutable: backupClientReady,
			configHealthy: status.healthy,
			configConfigured: status.configured,
			lastSuccessAt: status.lastSuccessAt ?? null,
			error: status.error ?? null,
		});
	},
});

/**
 * POST /admin/misc-redis-config/ramp  body: { percent? }
 * Start the ramp toward the non-active instance (default 0% — invalidation
 * fan-out begins before traffic moves), or update the existing ramp's percent.
 */
export const handleSetAdminMiscRedisRamp = createRoute({
	scopes: [Scopes.Superuser],
	body: z.object({
		percent: z.number().min(0).max(100).optional(),
	}),
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { percent } = c.req.valid("json");

		const hasRamp = getMiscRedisConfig().ramp !== null;
		if (hasRamp && percent !== undefined) {
			await updateMiscRedisRampPercent({ percent });
		} else {
			await startMiscRedisRamp({ percent });
		}

		ctx.logger.info(
			`[miscRedisConfig] ${actorString(ctx)} ${hasRamp ? "updated" : "started"} ramp, percent=${percent ?? 0}`,
		);
		return c.json({ success: true, ramp: getMiscRedisConfig().ramp });
	},
});

/** DELETE /admin/misc-redis-config/ramp — instant rollback to activeInstance. */
export const handleClearAdminMiscRedisRamp = createRoute({
	scopes: [Scopes.Superuser],
	handler: async (c) => {
		const ctx = c.get("ctx");
		await clearMiscRedisRamp();
		ctx.logger.info(`[miscRedisConfig] ${actorString(ctx)} cleared ramp`);
		return c.json({ success: true });
	},
});

/**
 * PATCH /admin/misc-redis-config/backup
 * body: { publicConnectionString, privateConnectionString? }
 * Accepts PLAINTEXT redis:// or rediss:// URIs — the always-reachable public
 * endpoint plus an optional private/VPC endpoint ECS prefers. Validates,
 * encrypts, persists. Refused while the backup instance is live.
 */
export const handleUpsertAdminMiscRedisBackup = createRoute({
	scopes: [Scopes.Superuser],
	body: z.object({
		publicConnectionString: z.string().min(1),
		privateConnectionString: z.string().min(1).optional(),
	}),
	handler: async (c) => {
		const ctx = c.get("ctx");
		const body = c.req.valid("json");

		const publicUrl = parseRedisConnectionString(
			body.publicConnectionString.trim(),
		);
		const privateRaw = body.privateConnectionString?.trim();
		if (privateRaw) parseRedisConnectionString(privateRaw);

		await upsertMiscRedisBackupConnection({
			publicConnectionString: encryptData(body.publicConnectionString.trim()),
			privateConnectionString: privateRaw ? encryptData(privateRaw) : null,
			url: publicUrl.host,
		});

		ctx.logger.info(
			`[miscRedisConfig] ${actorString(ctx)} set backup host=${publicUrl.host}`,
		);
		return c.json({ success: true, host: publicUrl.host });
	},
});

/** DELETE /admin/misc-redis-config/backup */
export const handleDeleteAdminMiscRedisBackup = createRoute({
	scopes: [Scopes.Superuser],
	handler: async (c) => {
		const ctx = c.get("ctx");
		await removeMiscRedisBackupConfig();
		ctx.logger.info(`[miscRedisConfig] ${actorString(ctx)} removed backup`);
		return c.json({ success: true });
	},
});

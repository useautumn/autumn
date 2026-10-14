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

export const handleClearAdminMiscRedisRamp = createRoute({
	scopes: [Scopes.Superuser],
	handler: async (c) => {
		const ctx = c.get("ctx");
		await clearMiscRedisRamp();
		ctx.logger.info(`[miscRedisConfig] ${actorString(ctx)} cleared ramp`);
		return c.json({ success: true });
	},
});

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

export const handleDeleteAdminMiscRedisBackup = createRoute({
	scopes: [Scopes.Superuser],
	handler: async (c) => {
		const ctx = c.get("ctx");
		await removeMiscRedisBackupConfig();
		ctx.logger.info(`[miscRedisConfig] ${actorString(ctx)} removed backup`);
		return c.json({ success: true });
	},
});

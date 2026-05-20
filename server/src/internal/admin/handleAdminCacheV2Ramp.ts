import { ErrCode, RecaseError, Scopes } from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import {
	closeRampDestinationClient,
	getCacheV2RampConfig,
	removeCacheV2RampOrg,
	updateCacheV2RampDestination,
	updateCacheV2RampPercent,
} from "@/internal/misc/cacheV2Ramp/index.js";
import { encryptData } from "@/utils/encryptUtils.js";

const REDIS_PROTOCOLS = new Set(["redis:", "rediss:"]);

const orgIdParam = z.object({ org_id: z.string().min(1) });

const actorString = (ctx: { user?: { email?: string }; userId?: string }) =>
	ctx.user?.email ?? ctx.userId ?? "unknown";

/**
 * GET /admin/cache-v2-ramp
 * Returns the current ramp config WITHOUT the encrypted connectionString —
 * we never echo ciphertext back to the UI. URL (host:port), percent, org
 * overrides, and timestamps are safe.
 */
export const handleGetAdminCacheV2Ramp = createRoute({
	scopes: [Scopes.Superuser],
	handler: async (c) => {
		const config = getCacheV2RampConfig();
		return c.json({
			destination: config.destination ? { url: config.destination.url } : null,
			percent: config.percent,
			previousPercent: config.previousPercent,
			changedAt: config.changedAt,
			orgs: config.orgs,
		});
	},
});

/**
 * PUT /admin/cache-v2-ramp/destination  body: { connectionString }
 * Accepts a PLAINTEXT redis:// or rediss:// connection string. Validates the
 * scheme, extracts host:port for logging, encrypts the connection string,
 * and persists. The plaintext never lands in S3.
 */
export const handleUpsertAdminCacheV2RampDestination = createRoute({
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

		await updateCacheV2RampDestination({
			destination: {
				connectionString: encryptData(connectionString),
				url: redisUrl.host,
			},
		});

		logger.info(
			`[admin/handleUpsertAdminCacheV2RampDestination] destination set, url=${redisUrl.host}, actor=${actorString(ctx)}`,
		);

		return c.json({ success: true });
	},
});

/**
 * DELETE /admin/cache-v2-ramp/destination
 * Clears the destination. Refuses while percent > 0 to prevent yanking the
 * rug from under in-flight ramped customers.
 */
export const handleDeleteAdminCacheV2RampDestination = createRoute({
	scopes: [Scopes.Superuser],
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { logger } = ctx;
		const config = getCacheV2RampConfig();

		if (config.percent > 0) {
			throw new RecaseError({
				message: `Cannot clear destination while percent is ${config.percent}%. Set it to 0 first.`,
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}
		const activeOrgPercent = Object.entries(config.orgs).find(
			([, entry]) => entry.percent > 0,
		);
		if (activeOrgPercent) {
			throw new RecaseError({
				message: `Cannot clear destination while org "${activeOrgPercent[0]}" has percent ${activeOrgPercent[1].percent}%. Set it to 0 first.`,
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}

		await updateCacheV2RampDestination({ destination: null });
		closeRampDestinationClient();

		logger.info(
			`[admin/handleDeleteAdminCacheV2RampDestination] destination cleared, actor=${actorString(ctx)}`,
		);

		return c.json({ success: true });
	},
});

/**
 * PUT /admin/cache-v2-ramp/percent  body: { percent }
 * Updates the global ramp percent. Refuses to go above 0 unless a destination
 * is configured (otherwise traffic would silently fall back to primary).
 */
export const handleUpdateAdminCacheV2RampPercent = createRoute({
	scopes: [Scopes.Superuser],
	body: z.object({ percent: z.number().int().min(0).max(100) }),
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { logger } = ctx;
		const { percent } = c.req.valid("json");
		const config = getCacheV2RampConfig();

		if (percent > 0 && !config.destination) {
			throw new RecaseError({
				message:
					"Cannot ramp above 0% without a destination configured. Set destination first.",
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}

		await updateCacheV2RampPercent({ percent });

		logger.info(
			`[admin/handleUpdateAdminCacheV2RampPercent] ${config.percent}% -> ${percent}%, actor=${actorString(ctx)}`,
		);

		return c.json({ success: true });
	},
});

/**
 * PUT /admin/cache-v2-ramp/orgs/:org_id  body: { percent }
 * Sets a per-org override.
 */
export const handleUpdateAdminCacheV2RampOrg = createRoute({
	scopes: [Scopes.Superuser],
	params: orgIdParam,
	body: z.object({ percent: z.number().int().min(0).max(100) }),
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { logger } = ctx;
		const { org_id: orgId } = c.req.param();
		const { percent } = c.req.valid("json");
		const config = getCacheV2RampConfig();

		if (percent > 0 && !config.destination) {
			throw new RecaseError({
				message:
					"Cannot set org override above 0% without a destination configured.",
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}

		await updateCacheV2RampPercent({ percent, orgId });

		const previous = config.orgs[orgId]?.percent ?? 0;
		logger.info(
			`[admin/handleUpdateAdminCacheV2RampOrg] org=${orgId}: ${previous}% -> ${percent}%, actor=${actorString(ctx)}`,
		);

		return c.json({ success: true });
	},
});

/**
 * DELETE /admin/cache-v2-ramp/orgs/:org_id
 * Removes a per-org override (org falls back to the global percent).
 */
export const handleDeleteAdminCacheV2RampOrg = createRoute({
	scopes: [Scopes.Superuser],
	params: orgIdParam,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { logger } = ctx;
		const { org_id: orgId } = c.req.param();

		await removeCacheV2RampOrg({ orgId });

		logger.info(
			`[admin/handleDeleteAdminCacheV2RampOrg] org=${orgId} override removed, actor=${actorString(ctx)}`,
		);

		return c.json({ success: true });
	},
});

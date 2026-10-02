import type { AppEnv } from "@autumn/shared";
import {
	createDashboardSession,
	dashboardFetch,
} from "@tests/utils/testInitUtils/dashboardSession.js";
import type { z } from "zod/v4";
import { getMiscRedis, waitForRedisReady } from "@/external/redis/initRedis.js";
import { acquireLockWithWait } from "@/external/redis/utils/lockUtils/acquireLockWithWait.js";
import { clearLock } from "@/external/redis/utils/lockUtils/clearLock.js";
import { RateLimitOverridesConfigSchema } from "@/internal/misc/rateLimiter/rateLimitOverridesSchemas.js";

type ServerEdgeConfigCtx = { org: { id: string }; env: AppEnv };

/**
 * Read-modify-write an edge config through the server's superuser /admin route, so the
 * change lands in the server process (in memory under AUTUMN_EDGE_CONFIG_OVERRIDE_B64).
 * A Redis lock per path serializes test files, since the PUT replaces the whole config.
 */
export const updateServerEdgeConfig = async <T>({
	ctx,
	path,
	schema,
	update,
}: {
	ctx: ServerEdgeConfigCtx;
	path: string;
	schema: z.ZodType<T>;
	update: (config: T) => T;
}) => {
	const lockKey = `test:server-edge-config:${path}`;
	const token = crypto.randomUUID();
	const session = await createDashboardSession(ctx, { superuser: true });
	try {
		await waitForRedisReady(getMiscRedis(), "main");
		await acquireLockWithWait({
			lockKey,
			ttlMs: 30_000,
			token,
			maxWaitMs: 120_000,
			retryMs: 100,
			retryJitterMs: 100,
			failOpen: false,
		});

		const current = await dashboardFetch(ctx, session, path, {
			method: "GET",
		});
		if (current.status !== 200) {
			throw new Error(
				`GET ${path} returned ${current.status}: ${JSON.stringify(current.data)}`,
			);
		}

		const written = await dashboardFetch(ctx, session, path, {
			method: "PUT",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(update(schema.parse(current.data))),
		});
		if (written.status !== 200) {
			throw new Error(
				`PUT ${path} returned ${written.status}: ${JSON.stringify(written.data)}`,
			);
		}
	} finally {
		await clearLock({ lockKey, token });
		await session.cleanup();
	}
};

const RATE_LIMIT_OVERRIDES_PATH = "/admin/rate-limit-overrides-config";

/**
 * Sets the server's rate-limit override for one org key (id or slug), leaving other
 * entries untouched. Returns a restore that removes only that key.
 */
export const setServerRateLimitOverride = async ({
	ctx,
	orgKey,
	limits,
}: {
	ctx: ServerEdgeConfigCtx;
	orgKey: string;
	limits: Record<string, number>;
}) => {
	// Without the in-memory override the route writes the shared S3 config the fleet reads.
	if (!process.env.AUTUMN_EDGE_CONFIG_OVERRIDE_B64) {
		throw new Error(
			"setServerRateLimitOverride requires AUTUMN_EDGE_CONFIG_OVERRIDE_B64 (in-memory edge config)",
		);
	}

	await updateServerEdgeConfig({
		ctx,
		path: RATE_LIMIT_OVERRIDES_PATH,
		schema: RateLimitOverridesConfigSchema,
		update: (config) => ({
			orgs: { ...config.orgs, [orgKey]: { limits } },
		}),
	});

	return {
		restore: () =>
			updateServerEdgeConfig({
				ctx,
				path: RATE_LIMIT_OVERRIDES_PATH,
				schema: RateLimitOverridesConfigSchema,
				update: (config) => {
					const { [orgKey]: _removed, ...orgs } = config.orgs;
					return { orgs };
				},
			}),
	};
};

import { timingSafeEqual } from "node:crypto";
import type { Context } from "hono";
import { clientCritical } from "../db/initDrizzle.js";
import { getDbHealth, PgHealth } from "../db/pgHealthMonitor.js";
import { redis } from "../external/redis/initRedis.js";
import type { HonoEnv } from "./HonoEnv.js";

const POSTGRES_TIMEOUT_MS = 1_000;
const REDIS_TIMEOUT_MS = 500;
const READY_CHECK_TOKEN = process.env.READY_CHECK_TOKEN?.trim();

const withTimeout = async <T>({
	timeoutMs,
	fn,
	onTimeout,
}: {
	timeoutMs: number;
	fn: () => Promise<T>;
	onTimeout?: () => void;
}): Promise<T> => {
	let timeoutId: ReturnType<typeof setTimeout> | undefined;

	try {
		return await Promise.race([
			fn(),
			new Promise<never>((_, reject) => {
				timeoutId = setTimeout(() => {
					onTimeout?.();
					reject(new Error(`timed out after ${timeoutMs}ms`));
				}, timeoutMs);
				timeoutId.unref?.();
			}),
		]);
	} finally {
		clearTimeout(timeoutId);
	}
};

const runPostgresCheck = async () => {
	const startedAt = Date.now();

	try {
		const health = getDbHealth();
		const query = clientCritical`SELECT 1`;
		await withTimeout({
			timeoutMs: POSTGRES_TIMEOUT_MS,
			fn: () => query,
			onTimeout: () => query.cancel(),
		});

		return {
			ok: health === PgHealth.Healthy,
			latencyMs: Date.now() - startedAt,
			monitorHealth: health,
			timeoutMs: POSTGRES_TIMEOUT_MS,
			error:
				health === PgHealth.Healthy
					? undefined
					: "postgres health monitor is degraded",
		};
	} catch (error) {
		return {
			ok: false,
			latencyMs: Date.now() - startedAt,
			monitorHealth: getDbHealth(),
			timeoutMs: POSTGRES_TIMEOUT_MS,
			error: error instanceof Error ? error.message : "unknown postgres error",
		};
	}
};

const runRedisCheck = async () => {
	const startedAt = Date.now();

	try {
		const result = await withTimeout({
			timeoutMs: REDIS_TIMEOUT_MS,
			fn: () => redis.ping(),
		});
		const status = redis.status;

		return {
			ok: status === "ready" && result === "PONG",
			latencyMs: Date.now() - startedAt,
			status,
			timeoutMs: REDIS_TIMEOUT_MS,
			error:
				status === "ready" && result === "PONG"
					? undefined
					: `unexpected redis state: status=${status}, ping=${result}`,
		};
	} catch (error) {
		return {
			ok: false,
			latencyMs: Date.now() - startedAt,
			status: redis.status,
			timeoutMs: REDIS_TIMEOUT_MS,
			error: error instanceof Error ? error.message : "unknown redis error",
		};
	}
};

const hasReadyCheckAccess = (c: Context<HonoEnv>) => {
	const providedToken = c.req.header("x-ready-check-token");

	if (!READY_CHECK_TOKEN || !providedToken) return false;

	const expected = Buffer.from(READY_CHECK_TOKEN);
	const provided = Buffer.from(providedToken);

	return (
		expected.length === provided.length && timingSafeEqual(expected, provided)
	);
};

export const handleReadyCheck = async (c: Context<HonoEnv>) => {
	const [postgresResult, redisResult] = await Promise.all([
		runPostgresCheck(),
		runRedisCheck(),
	]);

	const ok = postgresResult.ok && redisResult.ok;
	const status = ok ? 200 : 503;

	if (!hasReadyCheckAccess(c)) {
		return c.json({ ok }, status);
	}

	return c.json(
		{
			ok,
			checks: {
				postgres: postgresResult,
				redis: redisResult,
			},
		},
		status,
	);
};

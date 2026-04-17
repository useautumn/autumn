import { clientCritical } from "../db/initDrizzle.js";
import { getDbHealth, PgHealth } from "../db/pgHealthMonitor.js";
import { redis } from "../external/redis/initRedis.js";

const POSTGRES_TIMEOUT_MS = 1_000;
const REDIS_TIMEOUT_MS = 500;

const withTimeout = async <T>({
	timeoutMs,
	fn,
}: {
	timeoutMs: number;
	fn: () => Promise<T>;
}): Promise<T> => {
	let timeoutId: ReturnType<typeof setTimeout> | undefined;

	try {
		return await Promise.race([
			fn(),
			new Promise<never>((_, reject) => {
				timeoutId = setTimeout(
					() => reject(new Error(`timed out after ${timeoutMs}ms`)),
					timeoutMs,
				);
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
		await withTimeout({
			timeoutMs: POSTGRES_TIMEOUT_MS,
			fn: async () => {
				await clientCritical`SELECT 1`;
			},
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

export const handleReadyCheck = async () => {
	const [postgres, redis] = await Promise.all([
		runPostgresCheck(),
		runRedisCheck(),
	]);

	const ok = postgres.ok && redis.ok;

	return Response.json(
		{
			ok,
			checks: {
				postgres,
				redis,
			},
		},
		{ status: ok ? 200 : 503 },
	);
};

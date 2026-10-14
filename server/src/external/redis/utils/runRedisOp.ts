import type { UnavailableReason } from "@autumn/cache";
import { withTimeout } from "@autumn/shared";
import type { Redis } from "ioredis";
import { logger } from "@/external/logtail/logtailUtils.js";
import { acquireRedisReadLane } from "../initUtils/createRedisReadPool.js";
import { getStandbyRedisRouter } from "../initUtils/createStandbyRedisRouter.js";
import { RedisUnavailableError } from "./errors.js";
import { isConnectionLevelRedisError } from "./isTransientRedisError.js";

const REDIS_WARNING_INTERVAL_MS = 30_000;
const MIN_RETRY_BUDGET_MS = 50;
const STANDBY_RETRY_RESERVE_RATIO = 0.25;
const MAX_STANDBY_RETRY_RESERVE_MS = 250;
const lastRedisWarningAtBySource = new Map<string, number>();

export const getPreferredAttemptBudgetMs = ({
	timeoutMs,
}: {
	timeoutMs?: number;
}): number | undefined => {
	if (timeoutMs === undefined) return undefined;

	const retryReserveMs = Math.min(
		Math.floor(timeoutMs * STANDBY_RETRY_RESERVE_RATIO),
		MAX_STANDBY_RETRY_RESERVE_MS,
	);
	return retryReserveMs >= MIN_RETRY_BUDGET_MS
		? timeoutMs - retryReserveMs
		: timeoutMs;
};

const classifyErrorReason = (
	targetRedis: Redis,
	error: unknown,
): UnavailableReason | null => {
	if (targetRedis.status !== "ready") return "not_ready";
	const message = error instanceof Error ? error.message : String(error);
	if (/ETIMEDOUT|timeout/i.test(message)) return "timeout";
	if (/ECONN|closed|writeable|max retries/i.test(message)) return "connection";
	return null;
};

const warnRedisUnavailable = ({
	source,
	reason,
	error,
}: {
	source: string;
	reason: UnavailableReason;
	error?: unknown;
}) => {
	const key = `${source}:${reason}`;
	const now = Date.now();
	const lastWarningAt = lastRedisWarningAtBySource.get(key) ?? 0;
	if (now - lastWarningAt < REDIS_WARNING_INTERVAL_MS) return;

	lastRedisWarningAtBySource.set(key, now);
	logger.warn(
		{
			source,
			reason,
			error: error instanceof Error ? error.message : undefined,
		},
		"[redis] operation unavailable",
	);
};

export type { UnavailableReason };

export const runRedisOp = async <T>({
	operation,
	source,
	redisInstance,
	queueIfNotReady = false,
	retryOnStandby = false,
	useReadPool = false,
	timeoutMs,
}: {
	operation: (redis: Redis) => Promise<T>;
	source: string;
	redisInstance: Redis;
	queueIfNotReady?: boolean;
	retryOnStandby?: boolean;
	useReadPool?: boolean;
	/** Opt-in planned budget, tighter than the client's `commandTimeout`. Reads
	 *  only — the race abandons the promise but the command still reaches Redis. */
	timeoutMs?: number;
}): Promise<T> => {
	const readLaneLease =
		retryOnStandby && useReadPool
			? acquireRedisReadLane(redisInstance)
			: undefined;
	const targetRedis = readLaneLease?.redis ?? redisInstance;
	const redisAttempts: Promise<T>[] = [];

	try {
		if (!queueIfNotReady && targetRedis.status !== "ready") {
			const reason: UnavailableReason = "not_ready";
			warnRedisUnavailable({ source, reason });
			throw new RedisUnavailableError({ source, reason });
		}

		const deadlineAt = timeoutMs ? Date.now() + timeoutMs : undefined;
		const runAttempt = (redis: Redis, budgetMs?: number) => {
			const attempt = operation(redis);
			redisAttempts.push(attempt);
			return budgetMs
				? withTimeout({
						timeoutMs: budgetMs,
						fn: () => attempt,
						timeoutMessage: `[redis] ${source} timeout after ${budgetMs}ms`,
					})
				: attempt;
		};

		try {
			const router = retryOnStandby
				? getStandbyRedisRouter(targetRedis)
				: undefined;
			if (!router) return await runAttempt(targetRedis, timeoutMs);

			const [preferred, alternate] = router.ordered();
			const preferredAttemptBudgetMs = router.isUsable(alternate)
				? getPreferredAttemptBudgetMs({ timeoutMs })
				: timeoutMs;
			const reservedRetryBudgetMs =
				timeoutMs !== undefined && preferredAttemptBudgetMs !== undefined
					? timeoutMs - preferredAttemptBudgetMs
					: 0;

			try {
				const value = await runAttempt(preferred, preferredAttemptBudgetMs);
				router.recordOutcome({ connection: preferred });
				return value;
			} catch (firstError) {
				router.recordOutcome({ connection: preferred, error: firstError });

				const remainingMs = deadlineAt ? deadlineAt - Date.now() : undefined;
				const retryBudgetMs =
					remainingMs === undefined
						? undefined
						: Math.max(remainingMs, reservedRetryBudgetMs);
				const canRetry =
					alternate.status === "ready" &&
					isConnectionLevelRedisError({ error: firstError }) &&
					(retryBudgetMs === undefined || retryBudgetMs >= MIN_RETRY_BUDGET_MS);
				if (!canRetry) throw firstError;

				try {
					const value = await runAttempt(alternate, retryBudgetMs);
					router.recordOutcome({ connection: alternate });
					logger.info(
						{ source, type: "redis_standby_failover" },
						"[redis] standby served a read the preferred connection failed",
					);
					return value;
				} catch (retryError) {
					router.recordOutcome({ connection: alternate, error: retryError });
					throw retryError;
				}
			}
		} catch (error) {
			const classified = classifyErrorReason(targetRedis, error);
			const reason: UnavailableReason = classified ?? "other";
			warnRedisUnavailable({ source, reason, error });
			throw new RedisUnavailableError({ source, reason, cause: error });
		}
	} finally {
		if (readLaneLease && redisAttempts.length === 0) readLaneLease.release();
		if (readLaneLease && redisAttempts.length > 0) {
			void Promise.allSettled(redisAttempts).then(() =>
				readLaneLease.release(),
			);
		}
	}
};

export const tryRedisOp = async <T>({
	operation,
	source,
	redisInstance,
	queueIfNotReady,
	retryOnStandby,
	useReadPool,
	timeoutMs,
	onError,
}: {
	operation: (redis: Redis) => Promise<T>;
	source: string;
	redisInstance: Redis;
	queueIfNotReady?: boolean;
	retryOnStandby?: boolean;
	useReadPool?: boolean;
	timeoutMs?: number;
	onError?: (error: unknown) => void;
}): Promise<T | undefined> => {
	try {
		return await runRedisOp({
			operation,
			source,
			redisInstance,
			queueIfNotReady,
			retryOnStandby,
			useReadPool,
			timeoutMs,
		});
	} catch (error) {
		onError?.(error);
		return undefined;
	}
};

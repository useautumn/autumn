import { ms } from "@autumn/shared";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import {
	type EdgeConfigFollower,
	type FollowedStore,
	getEdgeConfigFollower,
} from "./edgeConfigFollower.js";
import {
	readEdgeConfigTimestamp,
	readEdgeConfigVersionFromRedis,
	writeEdgeConfigTimestamp,
} from "./edgeConfigTimestamp.js";

export type EdgeConfigLifecycle = FollowedStore & {
	s3Key: string;
	refresh: (options?: { logger?: Logger }) => Promise<void>;
	getStatus: () => { healthy: boolean };
};

const errorMessage = (error: unknown) =>
	error instanceof Error ? error.message : String(error);

/**
 * Change detection per tick: the Redis marker (cheap, every tick), the S3
 * timestamp (60s while Redis answers, 10s while it fails) and a 10-min backstop.
 * A marker only counts as handled once every store refreshed healthily.
 */
export const createEdgeConfigRegistry = ({
	readTimestamp = readEdgeConfigTimestamp,
	writeTimestamp = writeEdgeConfigTimestamp,
	readRedisVersion = readEdgeConfigVersionFromRedis,
	pollIntervalMs = process.env.NODE_ENV === "development"
		? ms.seconds(1)
		: ms.seconds(2),
	s3CheckIntervalMs = ms.seconds(60),
	s3FallbackCheckIntervalMs = ms.seconds(10),
	failedRefreshRetryMs = ms.seconds(10),
	backstopIntervalMs = ms.minutes(10),
	now = Date.now,
	follower,
}: {
	readTimestamp?: () => Promise<string | null>;
	writeTimestamp?: () => Promise<string>;
	readRedisVersion?: () => Promise<string | null>;
	pollIntervalMs?: number;
	s3CheckIntervalMs?: number;
	s3FallbackCheckIntervalMs?: number;
	failedRefreshRetryMs?: number;
	backstopIntervalMs?: number;
	now?: () => number;
	/** Undefined resolves the process-wide follower (cluster forks only). */
	follower?: EdgeConfigFollower | null;
} = {}) => {
	const stores: EdgeConfigLifecycle[] = [];
	let activeFollower: EdgeConfigFollower | null = null;
	let pollTimer: ReturnType<typeof setInterval> | null = null;
	let pollPromise: Promise<void> | null = null;
	let backstopTimer: ReturnType<typeof setInterval> | null = null;
	let backstopPromise: Promise<void> | null = null;
	let pollLogger: Logger | undefined;

	let seenRedisVersion: string | null = null;
	let appliedRedisVersion: string | null = null;
	let redisHealthy = false;
	let lastRedisError: string | undefined;

	let lastS3CheckAt = Number.NEGATIVE_INFINITY;
	let seenTimestamp: string | null = null;
	let appliedTimestamp: string | null | undefined;
	let s3ChangePending = false;
	let lastTimestampError: string | undefined;
	let timestampWriteAttempted = false;

	let refreshFailedAt: number | undefined;

	const register = ({ store }: { store: EdgeConfigLifecycle }) => {
		stores.push(store);
		// A store registered after start missed the startup load and would serve
		// its default until the next change or backstop.
		if (pollTimer) void store.refresh({ logger: pollLogger });
		else if (activeFollower) {
			void followStores({ entries: [store], logger: pollLogger });
		}
	};

	const refreshAll = async ({ logger }: { logger?: Logger } = {}) => {
		await Promise.all(stores.map((store) => store.refresh({ logger })));
		return stores.every((store) => store.getStatus().healthy);
	};

	const readRedisSignal = async ({ logger }: { logger?: Logger }) => {
		try {
			seenRedisVersion = await readRedisVersion();
			redisHealthy = true;
			lastRedisError = undefined;
		} catch (error) {
			redisHealthy = false;
			const message = errorMessage(error);
			if (message !== lastRedisError) {
				logger?.warn(
					`Failed to read edge config Redis marker, polling S3 timestamp every ${s3FallbackCheckIntervalMs}ms: ${message}`,
				);
			}
			lastRedisError = message;
		}
	};

	const readS3Signal = async ({
		checkedAt,
		logger,
	}: {
		checkedAt: number;
		logger?: Logger;
	}) => {
		lastS3CheckAt = checkedAt;
		try {
			const timestamp = await readTimestamp();
			lastTimestampError = undefined;
			if (timestamp !== null) timestampWriteAttempted = false;
			seenTimestamp = timestamp;
			if (timestamp === null || timestamp !== appliedTimestamp) {
				s3ChangePending = true;
			}
		} catch (error) {
			// Unknown state counts as changed, like the pre-Redis poll loop did.
			s3ChangePending = true;
			const message = errorMessage(error);
			if (message !== lastTimestampError) {
				logger?.warn(`Failed to read edge config timestamp: ${message}`);
			}
			lastTimestampError = message;
		}
	};

	/** One create attempt per missing-key stretch: every process polls, so
	 *  retrying each tick would hammer S3 fleet-wide while the key stays absent. */
	const ensureTimestamp = async ({
		logger,
	}: {
		logger?: Logger;
	}): Promise<string | null> => {
		if (timestampWriteAttempted) return null;
		timestampWriteAttempted = true;
		try {
			return await writeTimestamp();
		} catch (error) {
			logger?.warn(`Failed to create edge config timestamp: ${error}`);
			return null;
		}
	};

	const commitSignal = async ({ logger }: { logger?: Logger }) => {
		if (seenRedisVersion !== null) appliedRedisVersion = seenRedisVersion;
		if (!s3ChangePending) return;
		s3ChangePending = false;
		appliedTimestamp = seenTimestamp ?? (await ensureTimestamp({ logger }));
	};

	const refreshAndCommit = async ({
		attemptedAt,
		logger,
	}: {
		attemptedAt: number;
		logger?: Logger;
	}) => {
		const healthy = await refreshAll({ logger });
		if (!healthy) {
			refreshFailedAt = attemptedAt;
			return;
		}
		refreshFailedAt = undefined;
		await commitSignal({ logger });
	};

	const checkForChanges = async ({ logger }: { logger?: Logger } = {}) => {
		const tickAt = now();
		await readRedisSignal({ logger });

		const s3IntervalMs = redisHealthy
			? s3CheckIntervalMs
			: s3FallbackCheckIntervalMs;
		if (tickAt - lastS3CheckAt >= s3IntervalMs) {
			await readS3Signal({ checkedAt: tickAt, logger });
		}

		const redisChanged =
			seenRedisVersion !== null && seenRedisVersion !== appliedRedisVersion;
		const retrying = refreshFailedAt !== undefined;
		if (!redisChanged && !s3ChangePending && !retrying) return;
		// An outage must not cost a full refresh (~20 GETs) every 2s tick.
		if (retrying && tickAt - (refreshFailedAt ?? 0) < failedRefreshRetryMs) {
			return;
		}

		await refreshAndCommit({ attemptedAt: tickAt, logger });
	};

	const startLocalPolling = async ({ logger }: { logger?: Logger }) => {
		if (pollTimer) return;
		pollLogger = logger;
		const startedAt = now();
		// Markers are read before the refresh so a committed marker never names
		// newer content than this refresh fetched.
		await readRedisSignal({ logger });
		await readS3Signal({ checkedAt: startedAt, logger });
		await refreshAndCommit({ attemptedAt: startedAt, logger });

		pollTimer = setInterval(() => {
			if (pollPromise) return;
			pollPromise = checkForChanges({ logger }).finally(() => {
				pollPromise = null;
			});
		}, pollIntervalMs);

		// Self-heals a config whose signals never advanced (both writes lost after
		// the config landed), which neither marker can detect.
		backstopTimer = setInterval(() => {
			if (backstopPromise) return;
			backstopPromise = refreshAll({ logger })
				.then(() => {})
				.finally(() => {
					backstopPromise = null;
				});
		}, backstopIntervalMs);
	};

	/** Relay path: the cluster primary fetches; a key it never answers falls
	 *  back to local polling so a relay bug cannot strand a fork on defaults. */
	const followStores = async ({
		entries,
		logger,
	}: {
		entries: EdgeConfigLifecycle[];
		logger?: Logger;
	}) => {
		if (!activeFollower) return;
		const { timedOutKeys } = await activeFollower.follow({
			entries: entries.map((store) => ({ key: store.s3Key, store })),
			logger,
		});
		if (timedOutKeys.length === 0) return;
		if (!pollTimer) {
			await startLocalPolling({ logger });
			return;
		}
		const timedOut = entries.filter((store) =>
			timedOutKeys.includes(store.s3Key),
		);
		await Promise.all(timedOut.map((store) => store.refresh({ logger })));
	};

	const start = async ({ logger }: { logger?: Logger } = {}) => {
		if (activeFollower) return;
		if (pollTimer || process.env.AUTUMN_EDGE_CONFIG_OVERRIDE_B64) {
			await refreshAll({ logger });
			return;
		}

		activeFollower =
			follower === undefined ? getEdgeConfigFollower() : follower;
		if (!activeFollower) {
			await startLocalPolling({ logger });
			return;
		}
		pollLogger = logger;
		await followStores({ entries: stores, logger });
	};

	const stop = () => {
		if (pollTimer) clearInterval(pollTimer);
		if (backstopTimer) clearInterval(backstopTimer);
		pollTimer = null;
		backstopTimer = null;
	};

	return { register, start, stop, checkForChanges };
};

const registry = createEdgeConfigRegistry();

export const registerEdgeConfig = registry.register;
export const startAllEdgeConfigPolling = registry.start;
export const stopAllEdgeConfigPolling = registry.stop;

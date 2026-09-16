import type { Redis } from "ioredis";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import type { RedisConnectionState } from "./types/redisConnectionState.js";
import type { RegisteredRedisConnection } from "./types/registeredRedisConnection.js";

const queueLength = (queue: unknown): number | null => {
	if (!queue || typeof queue !== "object" || !("length" in queue)) return null;
	const length = queue.length;
	return typeof length === "number" && Number.isFinite(length) && length >= 0
		? length
		: null;
};

export const createRedisPoolMonitor = ({
	ctx,
}: {
	ctx: { logger: Pick<Logger, "info"> };
}) => {
	const connections = new Map<Redis, RegisteredRedisConnection>();
	const registered = new WeakSet<Redis>();
	let nextConnectionId = 0;
	let interval: ReturnType<typeof setInterval> | undefined;

	const emitConnectionSnapshot = ({
		redis,
		entry,
	}: {
		redis: Redis;
		entry: RegisteredRedisConnection;
	}) => {
		const role =
			process.env.WORKER === "true"
				? "worker"
				: process.env.CRON === "true"
					? "cron"
					: "http";
		try {
			ctx.logger.info("redis_pool_stats", {
				type: "redis_pool_stats",
				role,
				connectionId: entry.connectionId,
				name: entry.name,
				redisType: entry.redisType,
				status: redis.status,
				commandQueueLength: queueLength(Reflect.get(redis, "commandQueue")),
				offlineQueueLength: queueLength(Reflect.get(redis, "offlineQueue")),
				reconnectCount: entry.reconnectCount,
				connectionErrors: entry.connectionErrors,
				...entry.getState?.(),
			});
			entry.reconnectCount = 0;
			entry.connectionErrors = 0;
		} catch {}
	};

	const emitSnapshot = () => {
		for (const [redis, entry] of connections)
			emitConnectionSnapshot({ redis, entry });
	};

	const register = ({
		redis,
		name,
		redisType,
	}: {
		redis: Redis;
		name: string;
		redisType: string;
	}) => {
		if (registered.has(redis)) return;
		registered.add(redis);
		const entry = {
			connectionId: ++nextConnectionId,
			name,
			redisType,
			reconnectCount: 0,
			connectionErrors: 0,
		};
		connections.set(redis, entry);
		redis.on("reconnecting", () => {
			entry.reconnectCount++;
		});
		redis.on("error", () => {
			entry.connectionErrors++;
		});
		redis.on("end", () => {
			if (interval) emitConnectionSnapshot({ redis, entry });
			connections.delete(redis);
		});
		redis.on("connecting", () => {
			connections.set(redis, entry);
		});
	};

	const setStateReader = ({
		redis,
		getState,
	}: {
		redis: Redis;
		getState: () => RedisConnectionState;
	}) => {
		const entry = connections.get(redis);
		if (entry) entry.getState = getState;
	};

	const start = ({ intervalMs = 30_000 }: { intervalMs?: number } = {}) => {
		if (interval || process.env.NODE_ENV === "development") return;
		interval = setInterval(emitSnapshot, intervalMs);
		emitSnapshot();
	};

	const stop = () => {
		if (interval) clearInterval(interval);
		interval = undefined;
	};

	return { register, setStateReader, start, stop, emitSnapshot };
};

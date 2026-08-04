import type { Redis } from "ioredis";

export type RedisClientRole = "primary" | "standby";

type RedisClientPair = {
	primary: Redis;
	standby: Redis;
};

const pairByRouter = new WeakMap<Redis, RedisClientPair>();

const getReadyClientFromPair = ({
	pair,
	exclude,
}: {
	pair: RedisClientPair;
	exclude?: Redis;
}): Redis | null => {
	if (pair.primary !== exclude && pair.primary.status === "ready") {
		return pair.primary;
	}
	if (pair.standby !== exclude && pair.standby.status === "ready") {
		return pair.standby;
	}
	return null;
};

export const getReadyRedisClient = ({
	redisInstance,
	exclude,
}: {
	redisInstance: Redis;
	exclude?: Redis;
}): Redis | null => {
	const pair = pairByRouter.get(redisInstance);
	if (pair) return getReadyClientFromPair({ pair, exclude });
	if (redisInstance === exclude || redisInstance.status !== "ready")
		return null;
	return redisInstance;
};

const getRouterStatus = ({ primary, standby }: RedisClientPair): string => {
	if (primary.status === "ready" || standby.status === "ready") return "ready";
	if (primary.status !== "end") return primary.status;
	return standby.status;
};

const eventMethods = new Set([
	"on",
	"once",
	"off",
	"removeListener",
	"removeAllListeners",
]);

export const createRedisClientPairRouter = ({
	primary,
	standby,
}: RedisClientPair): Redis => {
	let router: Redis;
	const pair = { primary, standby };

	router = new Proxy({} as Redis, {
		get(_target, property) {
			if (property === "status") return getRouterStatus(pair);
			if (property === "disconnect") {
				return (...args: unknown[]) => {
					Reflect.apply(primary.disconnect, primary, args);
					Reflect.apply(standby.disconnect, standby, args);
				};
			}
			if (property === "connect") {
				return (...args: unknown[]) =>
					Promise.all([
						Reflect.apply(primary.connect, primary, args),
						Reflect.apply(standby.connect, standby, args),
					]).then(() => undefined);
			}
			if (property === "quit") {
				return (...args: unknown[]) =>
					Promise.all([
						Reflect.apply(primary.quit, primary, args),
						Reflect.apply(standby.quit, standby, args),
					]).then(([result]) => result);
			}
			if (property === "duplicate") {
				return (...args: unknown[]) => {
					const activeRedis = getReadyClientFromPair({ pair }) ?? pair.primary;
					return Reflect.apply(activeRedis.duplicate, activeRedis, args);
				};
			}
			if (typeof property === "string" && eventMethods.has(property)) {
				return (...args: unknown[]) => {
					const primaryMethod = Reflect.get(primary, property, primary);
					const standbyMethod = Reflect.get(standby, property, standby);
					Reflect.apply(primaryMethod, primary, args);
					Reflect.apply(standbyMethod, standby, args);
					return router;
				};
			}

			const activeRedis = getReadyClientFromPair({ pair }) ?? pair.primary;
			const value = Reflect.get(activeRedis, property, activeRedis);
			return typeof value === "function" ? value.bind(activeRedis) : value;
		},
		set(_target, property, value) {
			Reflect.set(primary, property, value, primary);
			Reflect.set(standby, property, value, standby);
			return true;
		},
	});

	pairByRouter.set(router, pair);
	return router;
};

export const createRedisClientPair = ({
	createClient,
}: {
	createClient: ({ role }: { role: RedisClientRole }) => Redis;
}): Redis => {
	const primary = createClient({ role: "primary" });
	const standby = createClient({ role: "standby" });
	return createRedisClientPairRouter({ primary, standby });
};

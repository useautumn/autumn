import type { Redis } from "ioredis";

const STANDBY_CONNECTIONS = Symbol("redisStandbyConnections");

type StandbyConnections = {
	primary: Redis;
	standby: Redis;
};

const IDEMPOTENT_READ_COMMANDS = new Set([
	"exists",
	"get",
	"getbuffer",
	"hget",
	"hgetall",
	"hlen",
	"hmget",
	"mget",
	"pttl",
	"scard",
	"sismember",
	"smembers",
	"strlen",
	"ttl",
	"type",
	"zcard",
	"zcount",
	"zrange",
	"zrangebyscore",
	"zrank",
	"zrevrange",
	"zrevrangebyscore",
	"zrevrank",
	"zscore",
]);

const orderedConnections = ({
	primary,
	standby,
}: StandbyConnections): Redis[] => {
	if (primary.status === "ready") return [primary, standby];
	if (standby.status === "ready") return [standby, primary];
	return [primary, standby];
};

export const getStandbyRedisConnections = (
	redis: Redis,
): Redis[] | undefined => {
	const connections = Reflect.get(
		redis,
		STANDBY_CONNECTIONS,
	) as StandbyConnections | null;
	return connections ? orderedConnections(connections) : undefined;
};

export const createStandbyRedisRouter = ({
	primary,
	standby,
}: StandbyConnections): Redis =>
	new Proxy({} as Redis, {
		get(_target, property) {
			if (property === STANDBY_CONNECTIONS) return { primary, standby };
			if (property === "status") {
				return primary.status === "ready" || standby.status === "ready"
					? "ready"
					: primary.status;
			}

			const [selected, alternate] = orderedConnections({ primary, standby });
			const value = Reflect.get(selected, property, selected);
			if (typeof value !== "function") return value;

			if (
				typeof property !== "string" ||
				!IDEMPOTENT_READ_COMMANDS.has(property.toLowerCase())
			) {
				return value.bind(selected);
			}

			return async (...args: unknown[]) => {
				try {
					return await Reflect.apply(value, selected, args);
				} catch (error) {
					if (alternate.status !== "ready") throw error;
					const retry = Reflect.get(alternate, property, alternate);
					return Reflect.apply(retry, alternate, args);
				}
			};
		},
		set(_target, property, value) {
			const [selected] = orderedConnections({ primary, standby });
			return Reflect.set(selected, property, value);
		},
	});

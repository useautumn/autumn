import { RedisStore } from "@hono-rate-limiter/redis";
import type { Env } from "hono";
import { redis } from "@/external/redis/initRedis.js";

export const createRateLimitRedisStore = <TEnv extends Env = Env>() =>
	new RedisStore<TEnv>({
		client: {
			scriptLoad: (script: string) =>
				redis.script("LOAD", script) as Promise<string>,
			evalsha: <TArgs extends unknown[], TData = unknown>(
				sha: string,
				keys: string[],
				args: TArgs,
			): Promise<TData> =>
				redis.evalsha(
					sha,
					keys.length,
					...keys,
					...(args as (string | number | Buffer)[]),
				) as Promise<TData>,
			decr: (key: string) => redis.decr(key),
			del: (key: string) => redis.del(key),
		},
	});

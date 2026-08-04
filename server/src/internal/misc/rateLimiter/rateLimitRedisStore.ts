import { RedisStore } from "@hono-rate-limiter/redis";
import type { Env } from "hono";
import { miscRedis } from "@/external/redis/initRedis.js";

export const createRateLimitRedisStore = <TEnv extends Env = Env>() =>
	new RedisStore<TEnv>({
		client: {
			scriptLoad: (script: string) =>
				miscRedis.script("LOAD", script) as Promise<string>,
			evalsha: <TArgs extends unknown[], TData = unknown>(
				sha: string,
				keys: string[],
				args: TArgs,
			): Promise<TData> =>
				miscRedis.evalsha(
					sha,
					keys.length,
					...keys,
					...(args as (string | number | Buffer)[]),
				) as Promise<TData>,
			decr: (key: string) => miscRedis.decr(key),
			del: (key: string) => miscRedis.del(key),
		},
	});

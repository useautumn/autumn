import { isTransientDbError } from "@/db/dbUtils.js";
import { shouldUseRedis } from "@/external/redis/initRedis.js";
import { RedisUnavailableError } from "./errors.js";

/** Runs `run`. If Redis is unavailable or a transient DB error occurs,
 *  calls `fallback`. Any other error propagates. */
export const withRedisFailOpen = async <T>({
	source,
	run,
	fallback,
}: {
	source: string;
	run: () => T | Promise<T>;
	fallback: (error: unknown) => T | Promise<T>;
}): Promise<T> => {
	try {
		if (!shouldUseRedis()) {
			throw new RedisUnavailableError({ source, reason: "not_ready" });
		}

		return await run();
	} catch (error) {
		if (error instanceof RedisUnavailableError || isTransientDbError({ error })) {
			return await fallback(error);
		}

		throw error;
	}
};

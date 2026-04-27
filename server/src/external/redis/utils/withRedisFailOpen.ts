import { isTransientDbError } from "@/db/dbUtils.js";
import { shouldUseRedisV2 } from "@/external/redis/initUtils/redisV2Availability.js";
import { RedisUnavailableError } from "./errors.js";
import { isTransientRedisError } from "./isTransientRedisError.js";

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
		if (!shouldUseRedisV2()) {
			throw new RedisUnavailableError({ source, reason: "not_ready" });
		}

		return await run();
	} catch (error) {
		if (isTransientRedisError({ error }) || isTransientDbError({ error })) {
			return await fallback(error);
		}

		throw error;
	}
};

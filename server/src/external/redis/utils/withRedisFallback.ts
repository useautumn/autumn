import { RedisUnavailableError } from "./errors.js";

/** Runs `primary`. If it throws `RedisUnavailableError`, calls `fallback`
 *  with the error and returns its result. Any other error propagates.
 *  Both `primary` and `fallback` may be synchronous or async. */
export const withRedisFallback = async <T>({
	primary,
	fallback,
}: {
	primary: () => T | Promise<T>;
	fallback: (error: RedisUnavailableError) => T | Promise<T>;
}): Promise<T> => {
	try {
		return await primary();
	} catch (error) {
		if (error instanceof RedisUnavailableError) return await fallback(error);
		throw error;
	}
};

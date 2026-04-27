import { RedisUnavailableError } from "@/external/redis/utils/errors.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

/** Runs `operation`. If it throws or returns `undefined`, logs a warning,
 *  calls `invalidate`, and returns `undefined`. Collapses the repetitive
 *  "warn + invalidate + miss" pattern used by FullSubject cache readers
 *  for both try/catch blocks (parse, hydrate) and conditional guards
 *  (stale epoch, stale rollout, incomplete balances, etc). */
export const tryOrInvalidate = async <T>({
	ctx,
	operation,
	invalidate,
	warnMessage,
}: {
	ctx: AutumnContext;
	operation: () => T | undefined | Promise<T | undefined>;
	invalidate: () => Promise<void>;
	warnMessage: string;
}): Promise<T | undefined> => {
	try {
		const result = await operation();
		if (result !== undefined) return result;
		ctx.logger.warn(warnMessage);
	} catch (error) {
		if (error instanceof RedisUnavailableError) throw error;
		ctx.logger.warn(`${warnMessage}, error: ${error}`);
	}
	await invalidate();
	return undefined;
};

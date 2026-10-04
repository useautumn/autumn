import { RecaseError } from "@autumn/shared";
import { withPoolReason } from "@/db/poolAttribution/poolAttribution.js";
import { isTransientRedisError } from "@/external/redis/utils/isTransientRedisError.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { balanceWorkerFailOpenReasonOf } from "@/internal/balances/balanceWorker/balanceWorkerErrors.js";
import { isTransientDbError } from "./dbUtils.js";

export const shed503OnTransientError = async <T>({
	ctx,
	source,
	run,
	onTransientError,
	fallbackOnRedisUnavailable,
}: {
	ctx: AutumnContext;
	source: string;
	run: () => T | Promise<T>;
	onTransientError?: (error: unknown) => Promise<void>;
	/** Opt-in Postgres path for cache-only failures. Callers that omit it keep
	 *  the shed-everything behaviour. */
	fallbackOnRedisUnavailable?: (error: unknown) => T | Promise<T>;
}): Promise<T> => {
	try {
		return await run();
	} catch (error) {
		const isDbTransient = isTransientDbError({ error });
		const isRedisTransient = isTransientRedisError({ error });
		// The worker gave no verdict; its error is already a 503 that names why.
		const isWorkerTransient = balanceWorkerFailOpenReasonOf(error) !== null;

		if (!(isDbTransient || isRedisTransient || isWorkerTransient)) {
			throw error;
		}

		// Only when Postgres is uninvolved — it is what the fallback reads from,
		// so a struggling DB must shed rather than take more load.
		if (isRedisTransient && !isDbTransient && fallbackOnRedisUnavailable) {
			try {
				ctx.logger.warn(`[${source}] redis unavailable, reading postgres`, {
					type: `${source}_redis_fallback`,
					error,
				});
				return await withPoolReason({
					reason: "dragonfly-fallback",
					fn: () => fallbackOnRedisUnavailable(error),
				});
			} catch (fallbackError) {
				const fallbackFailedTransiently =
					isTransientDbError({ error: fallbackError }) ||
					isTransientRedisError({ error: fallbackError });
				// A non-transient fallback failure (e.g. a 404) is the real answer, not an outage.
				if (!fallbackFailedTransiently) throw fallbackError;
				ctx.logger.error(`[${source}] postgres fallback failed, shedding`, {
					type: `${source}_redis_fallback_failed`,
					error: fallbackError,
				});
			}
		}

		ctx.logger.warn(`[${source}] transient error, shedding with 503`, {
			type: `${source}_shed`,
			error,
		});
		try {
			await onTransientError?.(error);
		} catch (recoveryError) {
			ctx.logger.error(
				`[${source}] Failed to capture transient error for recovery`,
				{ error: recoveryError },
			);
		}
		if (isWorkerTransient) throw error;
		throw new RecaseError({
			message: "Service is temporarily unavailable, please retry shortly.",
			code: "service_unavailable",
			statusCode: 503,
			data: {
				reason: isDbTransient ? "critical_db_saturated" : "cache_unavailable",
			},
			cause: error,
		});
	}
};

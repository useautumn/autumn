import {
	InsufficientBalanceError,
	type TrackParams,
	type TrackResponseV2,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { FeatureDeduction } from "../../utils/types/featureDeduction.js";
import {
	RedisDeductionError,
	RedisDeductionErrorCode,
} from "../../utils/types/redisDeductionError.js";
import { runPostgresTrack } from "./runPostgresTrack.js";
/**
 * Handles errors from Redis deduction.
 * - Throws InsufficientBalanceError for INSUFFICIENT_BALANCE
 * - Falls back to Postgres for other RedisDeductionError (if shouldFallback)
 * - Rethrows all other errors
 */
export const handleRedisTrackError = async ({
	ctx,
	error,
	body,
	featureDeductions,
}: {
	ctx: AutumnContext;
	error: Error;
	body: TrackParams;
	featureDeductions: FeatureDeduction[];
}): Promise<TrackResponseV2> => {
	if (!(error instanceof RedisDeductionError)) {
		throw error;
	}

	// Handle insufficient balance - throw specific error
	if (error.code === RedisDeductionErrorCode.InsufficientBalance) {
		throw new InsufficientBalanceError({
			value: body.value ?? 1,
			featureId: body.feature_id,
			eventName: body.event_name,
		});
	}

	// Fallback to Postgres for recoverable errors
	if (error.shouldFallback()) {
		ctx.logger.warn(
			`Falling back to Postgres for track operation: ${error.code}`,
		);

		return await runPostgresTrack({
			ctx,
			body,
			featureDeductions,
		});
	}

	// All other Redis errors - rethrow
	throw error;
};

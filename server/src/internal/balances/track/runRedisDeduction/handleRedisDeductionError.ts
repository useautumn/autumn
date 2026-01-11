import type { TrackParams, TrackResponseV2 } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { RedisDeductionError } from "../../utils/types/redisDeductionError.js";
import { executePostgresTracking } from "../trackUtils/executePostgresTracking.js";
import type { FeatureDeduction } from "../trackUtils/getFeatureDeductions.js";

export type HandleRedisDeductionErrorParams = {
	ctx: AutumnContext;
	error: Error;
	body: TrackParams;
	featureDeductions: FeatureDeduction[];
};

/**
 * Handles errors from Redis deduction.
 * - Falls back to Postgres for RedisDeductionError (if shouldFallback)
 * - Rethrows all other errors
 */
export const handleRedisDeductionError = async ({
	ctx,
	error,
	body,
	featureDeductions,
}: HandleRedisDeductionErrorParams): Promise<TrackResponseV2> => {
	// Check if it's a Redis deduction error that should fallback
	if (error instanceof RedisDeductionError && error.shouldFallback()) {
		ctx.logger.warn(
			`Falling back to Postgres for track operation: ${error.code}`,
		);

		return await executePostgresTracking({
			ctx,
			body,
			featureDeductions,
		});
	}

	// All other errors - rethrow
	throw error;
};

import {
	ErrCode,
	InsufficientBalanceError,
	RecaseError,
	type TrackParams,
	type TrackResponseV3,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	attachCascadeReplayState,
	buildCascadeReplayDeductions,
	getCascadeReplayState,
} from "../../utils/types/cascadeReplayState.js";
import type { FeatureDeduction } from "../../utils/types/featureDeduction.js";
import {
	RedisDeductionError,
	RedisDeductionErrorCode,
} from "../../utils/types/redisDeductionError.js";
import { queueTrack } from "./queueTrack.js";
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
}): Promise<TrackResponseV3> => {
	if (!(error instanceof RedisDeductionError)) {
		throw error;
	}

	if (error.code === RedisDeductionErrorCode.InsufficientBalance) {
		const insufficientBalanceError = new InsufficientBalanceError({
			value: error.rejectedValue ?? body.value ?? 1,
			// A cascade rejects on the overage system, not the primary feature on
			// the body; the deduction error carries the rejecting feature's id.
			featureId: error.featureId ?? body.feature_id,
			eventName: body.event_name,
		});
		attachCascadeReplayState({
			error: insufficientBalanceError,
			state: getCascadeReplayState(error),
		});
		throw insufficientBalanceError;
	}

	if (error.code === RedisDeductionErrorCode.LockAlreadyExists) {
		throw new RecaseError({
			message: "A lock with this ID already exists",
			code: ErrCode.LockAlreadyExists,
			statusCode: 409,
		});
	}

	if (error.isRedisUnavailable()) {
		const queuedResponse = await queueTrack({
			ctx,
			body,
			featureDeductions,
			cascadeReplayState: getCascadeReplayState(error),
		});
		if (queuedResponse) return queuedResponse;
		throw error;
	}

	if (error.shouldFallback()) {
		ctx.logger.warn(
			`Falling back to Postgres for track operation: ${error.code}`,
		);
		const replayState = getCascadeReplayState(error);
		const fallbackFeatureDeductions = replayState
			? buildCascadeReplayDeductions({
					featureDeductions,
					replayState,
				})
			: featureDeductions;
		if (!fallbackFeatureDeductions) {
			throw new RecaseError({
				message: "Cascade replay is missing an overage deduction",
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}

		return await runPostgresTrack({
			ctx,
			body,
			featureDeductions: fallbackFeatureDeductions,
		});
	}

	throw error;
};

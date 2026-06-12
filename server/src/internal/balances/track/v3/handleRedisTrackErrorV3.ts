import {
	ErrCode,
	type FullSubject,
	InsufficientBalanceError,
	RecaseError,
	type TrackParams,
	type TrackResponseV3,
} from "@autumn/shared";
import { RedisUnavailableError } from "@/external/redis/utils/errors.js";
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
import { runPostgresTrackV3 } from "./runPostgresTrackV3.js";

/** Handles errors from V2 Redis deduction. Falls back to Postgres V3 path. */
export const handleRedisTrackErrorV3 = async ({
	ctx,
	error,
	body,
	fullSubject,
	featureDeductions,
}: {
	ctx: AutumnContext;
	error: Error;
	body: TrackParams;
	fullSubject: FullSubject;
	featureDeductions: FeatureDeduction[];
}): Promise<TrackResponseV3> => {
	if (!(error instanceof RedisDeductionError)) throw error;

	if (error.code === RedisDeductionErrorCode.InsufficientBalance) {
		const insufficientBalanceError = new InsufficientBalanceError({
			value: error.rejectedValue ?? body.value ?? 1,
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

	if (error.code === RedisDeductionErrorCode.DuplicateIdempotencyKey) {
		throw new RecaseError({
			message: body.idempotency_key
				? `Another request with idempotency key ${body.idempotency_key} has already been received`
				: "This track request has already been received",
			code: ErrCode.DuplicateIdempotencyKey,
			statusCode: 409,
		});
	}

	if (error.isRedisUnavailable()) {
		throw new RedisUnavailableError({
			source: "runTrackV3",
			reason: "other",
			cause: error,
		});
	}

	if (error.shouldFallback()) {
		ctx.logger.warn(
			`Falling back to Postgres V3 for track operation: ${error.code}`,
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

		return runPostgresTrackV3({
			ctx,
			fullSubject,
			body,
			featureDeductions: fallbackFeatureDeductions,
		});
	}

	throw error;
};

import {
	ErrCode,
	type FullSubject,
	InsufficientBalanceError,
	RecaseError,
	type TrackParams,
	type TrackResponseV3,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { FeatureDeduction } from "../../utils/types/featureDeduction.js";
import {
	RedisDeductionError,
	RedisDeductionErrorCode,
} from "../../utils/types/redisDeductionError.js";
import { queueTrack } from "../utils/queueTrack.js";
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
		throw new InsufficientBalanceError({
			value: body.value ?? 1,
			featureId: body.feature_id,
			eventName: body.event_name,
		});
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
			message: `Another request with idempotency key ${body.idempotency_key} has already been received`,
			code: ErrCode.DuplicateIdempotencyKey,
			statusCode: 409,
		});
	}

	if (error.isRedisUnavailable()) {
		const queuedResponse = await queueTrack({ ctx, body });
		if (queuedResponse) return queuedResponse;
		throw error;
	}

	if (error.shouldFallback()) {
		ctx.logger.warn(
			`Falling back to Postgres V3 for track operation: ${error.code}`,
		);

		return runPostgresTrackV3({
			ctx,
			fullSubject,
			body,
			featureDeductions,
		});
	}

	throw error;
};

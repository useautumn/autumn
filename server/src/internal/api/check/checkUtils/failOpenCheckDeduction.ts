import {
	type CheckParams,
	ErrCode,
	FeatureType,
	findFeatureById,
	type ParsedCheckParams,
	RecaseError,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { checkParamsToTrackBody } from "@/internal/balances/check/checkParamsToTrackBody.js";
import { queueTrack } from "@/internal/balances/track/utils/queueTrack.js";

/**
 * Whether a check that fails open still owes its deduction: `send_event` from a secret key on a
 * metered feature. A lock check is left out: its reservation needs a receipt, not a replayed track.
 */
export const failOpenCheckDeducts = ({
	ctx,
	body,
}: {
	ctx: AutumnContext;
	body: ParsedCheckParams | CheckParams;
}): boolean => {
	if (body.send_event !== true || body.lock?.enabled || ctx.isPublic)
		return false;
	const feature = findFeatureById({
		features: ctx.features,
		featureId: body.feature_id ?? "",
	});
	return Boolean(feature) && feature?.type !== FeatureType.Boolean;
};

/**
 * Queues a failed-open check's deduction as the track the check would have run, under the request id.
 * The replay and an original that lands late (after the route timeout) dedupe on the same
 * `track:${ctx.id}` key in the deduction Lua, so it applies once. False when the queue refused it.
 */
export const queueFailOpenCheckDeduction = async ({
	ctx,
	body,
	requiredBalance,
}: {
	ctx: AutumnContext;
	body: ParsedCheckParams;
	requiredBalance: number;
}): Promise<boolean> => {
	const queued = await queueTrack({
		ctx,
		body: checkParamsToTrackBody({ body, requiredBalance }),
		options: { logFallback: false },
	});
	return queued !== null;
};

/** An allow with nothing recorded would be free usage, so a deduction that can't be queued is a retryable 503. */
export const checkDeductionNotQueuedError = () =>
	new RecaseError({
		message:
			"Check with send_event could not record its deduction. Retry the request.",
		code: ErrCode.InternalError,
		statusCode: 503,
	});

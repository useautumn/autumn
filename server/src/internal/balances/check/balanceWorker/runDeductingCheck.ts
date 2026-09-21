import type { CheckResult, SubjectState } from "@autumn/balance-engine";
import {
	type BalanceWorkerClient,
	BalanceWorkerClientError,
	type TrackReply,
} from "@autumn/balance-worker-client";
import {
	ErrCode,
	FeatureType,
	featureUtils,
	findFeatureById,
	type ParsedCheckParams,
	RecaseError,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { scheduleLockExpiry } from "../../balanceWorker/lockExpirySchedule.js";
import { trackParamsToTrackCommand } from "../../track/balanceWorker/balanceWorkerTrackRequest.js";

/** What a check learned from the worker; `state` is null when nothing is attached, since there was nothing to read. */
export type WorkerCheckAnswer = {
	result: CheckResult;
	state: SubjectState | null;
};

const requiredBalanceOf = ({ body }: { body: ParsedCheckParams }): number =>
	body.required_balance ?? body.required_quantity ?? 1;

/** The legacy path refuses these before deducting, so the worker path does too. */
const assertCheckCanDeduct = ({
	ctx,
	body,
}: {
	ctx: AutumnContext;
	body: ParsedCheckParams;
}): void => {
	const feature = findFeatureById({
		features: ctx.features,
		featureId: body.feature_id ?? "",
	});
	if (!feature) return;
	if (body.lock && featureUtils.isAllocated(feature))
		throw new RecaseError({
			message: "Lock is not supported for allocated features",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	if (feature.type === FeatureType.Boolean)
		throw new RecaseError({
			message:
				"send_event cannot be used with boolean features, which are flags rather than usage-tracked.",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
};

/** A track that applied is an allowed check; the required balance is reported in the funding feature's units. */
const trackReplyToCheckAnswer = ({
	reply,
	body,
}: {
	reply: TrackReply;
	body: ParsedCheckParams;
}): WorkerCheckAnswer => {
	const allowed = reply.result.status === "applied";
	return {
		result: {
			allowed,
			reason: allowed ? null : "insufficient_balance",
			requiredBalance: new Decimal(requiredBalanceOf({ body }))
				.mul(reply.result.fundingCreditCost)
				.toNumber(),
			fundingFeatureId: reply.result.fundingFeatureId,
			isFlag: false,
		},
		state: reply.state,
	};
};

/** Nothing funds the feature: only a requirement of nothing is met, and there is no balance to report. */
const nothingAttachedAnswer = ({
	body,
}: {
	body: ParsedCheckParams;
}): WorkerCheckAnswer => {
	const requiredBalance = requiredBalanceOf({ body });
	const allowed = requiredBalance <= 0;
	return {
		result: {
			allowed,
			reason: allowed ? null : "feature_not_attached",
			requiredBalance,
			fundingFeatureId: null,
			isFlag: false,
		},
		state: null,
	};
};

const isNothingAttached = ({ cause }: { cause: unknown }): boolean =>
	cause instanceof BalanceWorkerClientError &&
	cause.workerCode === "UNSUPPORTED_COMMAND" &&
	cause.workerReason === "feature_not_found";

/**
 * A check with `send_event` or a lock is one track: reject mode, or the lock's own overage behaviour.
 * Whether it applied is the answer, so deciding and deducting cannot be split by another request.
 */
export async function runDeductingCheck({
	ctx,
	body,
	client,
}: {
	ctx: AutumnContext;
	body: ParsedCheckParams;
	client: Pick<BalanceWorkerClient, "track">;
}): Promise<WorkerCheckAnswer> {
	assertCheckCanDeduct({ ctx, body });
	const command = trackParamsToTrackCommand({
		ctx,
		enforceOverdueBlock: true,
		lock: body.lock,
		body: {
			customer_id: body.customer_id,
			entity_id: body.entity_id,
			feature_id: body.feature_id,
			value: requiredBalanceOf({ body }),
			properties: body.properties,
			// A lock keeps its overage behaviour for a later confirm above the lock.
			overage_behavior: body.lock?.overage_behavior ?? "reject",
		},
	});
	try {
		const reply = await client.track({ command });
		// A rejected track took nothing, so there is no lock to expire.
		if (body.lock && reply.result.status === "applied")
			await scheduleLockExpiry({
				ctx,
				customerId: body.customer_id,
				lock: body.lock,
			});
		return trackReplyToCheckAnswer({ reply, body });
	} catch (cause) {
		if (isNothingAttached({ cause })) return nothingAttachedAnswer({ body });
		throw cause;
	}
}

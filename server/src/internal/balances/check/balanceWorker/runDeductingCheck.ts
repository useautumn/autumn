import type {
	Catalog,
	CheckResult,
	SubjectState,
} from "@autumn/balance-engine";
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

export type WorkerCheckAnswer = {
	result: CheckResult;
	state: SubjectState | null;
	catalog: Catalog | null;
};

export const requiredBalanceOf = ({
	body,
}: {
	body: ParsedCheckParams;
}): number => body.required_balance ?? body.required_quantity ?? 1;

const assertCheckCanDeduct = ({
	ctx,
	body,
}: {
	ctx: AutumnContext;
	body: ParsedCheckParams;
}): void => {
	if (ctx.isPublic)
		throw new RecaseError({
			message:
				"Can't use send_event: true with a publishable key. Use your secret API key instead.",
			statusCode: 400,
		});
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
			limitType: null,
			requiredBalance: new Decimal(requiredBalanceOf({ body }))
				.mul(reply.result.fundingCreditCost)
				.toNumber(),
			fundingFeatureId: reply.result.fundingFeatureId,
			isFlag: false,
		},
		state: reply.state,
		catalog: reply.catalog,
	};
};

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
			limitType: null,
			requiredBalance,
			fundingFeatureId: null,
			isFlag: false,
		},
		state: null,
		catalog: null,
	};
};

const isNothingAttached = ({ cause }: { cause: unknown }): boolean =>
	cause instanceof BalanceWorkerClientError &&
	cause.workerCode === "UNSUPPORTED_COMMAND" &&
	cause.workerReason === "feature_not_found";

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
			skip_event: body.skip_event,
			overage_behavior: body.lock?.overage_behavior ?? "reject",
		},
	});
	try {
		const reply = await client.track({ command });
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

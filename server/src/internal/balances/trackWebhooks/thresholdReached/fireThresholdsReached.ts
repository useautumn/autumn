import {
	type ThresholdReached,
	trackToThresholdsReached,
} from "@autumn/balance-webhooks";
import type { TrackReply } from "@autumn/balance-worker-client/protocol";
import {
	ApiVersion,
	addToExpand,
	CustomerExpand,
	type TrackParams,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	workerReplyToFullSubject,
	workerStateToApiBalance,
} from "@/internal/balances/balanceWorker/workerStateToApiBalance.js";
import { readBalanceWorkerSubject } from "@/internal/balanceWorker/subject/readBalanceWorkerSubject.js";
import { sendThresholdsReached } from "./sendThresholdsReached.js";

/** Versions up to 1.2 rendered the event's customer with these expanded. */
const expandForApiVersion = ({
	ctx,
}: {
	ctx: AutumnContext;
}): AutumnContext => {
	if (!ctx.apiVersion.lte(ApiVersion.V1_2)) return ctx;
	return addToExpand({
		ctx,
		add: [
			CustomerExpand.BalancesFeature,
			CustomerExpand.SubscriptionsPlan,
			CustomerExpand.PurchasesPlan,
		],
	});
};

/** What one reply crossed, judged on the funding balance at the tracked identity. */
const replyToThresholdsReached = ({
	ctx,
	body,
	reply,
}: {
	ctx: AutumnContext;
	body: TrackParams;
	reply: TrackReply;
}): ThresholdReached[] => {
	const fullSubject = workerReplyToFullSubject({
		state: reply.state,
		catalog: reply.catalog,
		entityId: body.entity_id,
	});
	return trackToThresholdsReached({
		effects: reply.effects ?? [],
		result: reply.result,
		fundingBalance: workerStateToApiBalance({
			ctx,
			fullSubject,
			featureId: reply.result.fundingFeatureId,
		}),
	});
};

/** The deprecated `customer.threshold_reached` for a worker track: only callers below API 2.1 still receive it. */
export const fireThresholdsReached = async ({
	ctx,
	body,
	replies,
}: {
	ctx: AutumnContext;
	body: TrackParams;
	replies: TrackReply[];
}): Promise<void> => {
	if (ctx.apiVersion.gte(ApiVersion.V2_1)) return;
	const thresholdsReached = replies.flatMap((reply) =>
		replyToThresholdsReached({ ctx, body, reply }),
	);
	if (thresholdsReached.length === 0) return;

	// The reply only holds the tracked feature's rows; the event renders the whole customer.
	const renderCtx = expandForApiVersion({ ctx });
	const fullSubject = await readBalanceWorkerSubject({
		ctx: renderCtx,
		customerId: body.customer_id,
	});
	await sendThresholdsReached({
		ctx: renderCtx,
		fullSubject,
		thresholdsReached,
		entityId: body.entity_id,
	});
};

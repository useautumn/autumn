import { subjectStateToFullSubject } from "@autumn/balance-engine";
import {
	isFeatureHeld,
	workerStateToApiBalance,
} from "@autumn/balance-engine/api-renderer";
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
import { readBalanceWorkerSubject } from "@/internal/balanceWorker/subject/readBalanceWorkerSubject.js";
import { sendThresholdsReached } from "./sendThresholdsReached.js";

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

const replyToThresholdsReached = ({
	ctx,
	body,
	reply,
}: {
	ctx: AutumnContext;
	body: TrackParams;
	reply: TrackReply;
}): ThresholdReached[] => {
	const fullSubject = subjectStateToFullSubject({
		state: reply.state,
		catalog: reply.catalog,
		entityId: body.entity_id,
	});
	const featureId = reply.result.fundingFeatureId;
	if (!isFeatureHeld({ fullSubject, featureId })) return [];
	const fundingBalance = workerStateToApiBalance({
		ctx,
		fullSubject,
		featureId,
	});
	if (!fundingBalance) return [];
	return trackToThresholdsReached({
		effects: reply.effects ?? [],
		result: reply.result,
		fundingBalance,
	});
};

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

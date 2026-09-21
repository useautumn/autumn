import type { WorkerFullSubject } from "@autumn/balance-engine";
import type { TrackReply } from "@autumn/balance-worker-client";
import {
	AffectedResource,
	type ApiBalanceV1,
	applyResponseVersionChanges,
	fullSubjectToCustomerEntitlements,
	fullSubjectToRelevantFeatures,
	InsufficientBalanceError,
	type TrackParams,
	type TrackResponseV3,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	workerReplyToFullSubject,
	workerStateToApiBalance,
} from "../../balanceWorker/workerStateToApiBalance.js";
import { trackReplyToDeductions } from "./trackReplyToDeductions.js";

/** One worker track and the feature it was sent for; an event name yields one per feature it maps to. */
export type FeatureTrackReply = { featureId: string; reply: TrackReply };

/** The legacy `balances` map: each tracked feature and the credit systems that can fund it, null where the customer holds none. */
const balancesOf = ({
	ctx,
	fullSubject,
	featureIds,
}: {
	ctx: AutumnContext;
	fullSubject: WorkerFullSubject;
	featureIds: string[];
}): Record<string, ApiBalanceV1 | null> | undefined => {
	const balances: Record<string, ApiBalanceV1 | null> = {};
	for (const featureId of featureIds) {
		const relevantFeatures = fullSubjectToRelevantFeatures({
			fullSubject,
			featureId,
			features: ctx.features,
		});
		for (const feature of relevantFeatures) {
			const isHeld =
				fullSubjectToCustomerEntitlements({
					fullSubject,
					featureIds: [feature.id],
				}).length > 0;
			balances[feature.id] = isHeld
				? workerStateToApiBalance({ ctx, fullSubject, featureId: feature.id })
				: null;
		}
	}
	return Object.keys(balances).length < 2 ? undefined : balances;
};

/** The one place worker track replies become the API's track response. */
export function trackRepliesToApiResponse({
	ctx,
	body,
	replies,
}: {
	ctx: AutumnContext;
	body: TrackParams;
	replies: FeatureTrackReply[];
}): TrackResponseV3 {
	const value = body.value ?? 1;
	// Every reply carries the whole customer's rows and their catalog, so the last one is the freshest view of all features.
	const { state, catalog } = replies[replies.length - 1].reply;
	const fullSubject = workerReplyToFullSubject({
		state,
		catalog,
		entityId: body.entity_id,
	});
	// The worker names the feature each balance is reported in: the tracked one, or the credit system funding it.
	const fundingFeatureIds = [
		...new Set(
			replies.map(({ featureId, reply }) => reply.result.fundingFeatureId),
		),
	];
	const fundingBalances = fundingFeatureIds.map((featureId) =>
		workerStateToApiBalance({ ctx, fullSubject, featureId }),
	);

	const rejectedIndex = replies.findIndex(
		({ reply }) => reply.result.status === "rejected",
	);
	if (rejectedIndex !== -1) {
		const rejected = replies[rejectedIndex];
		const fundingFeatureId = rejected.reply.result.fundingFeatureId;
		throw new InsufficientBalanceError({
			featureId: rejected.featureId,
			value,
			balance:
				fundingBalances[fundingFeatureIds.indexOf(fundingFeatureId)].remaining,
		});
	}

	return applyResponseVersionChanges<TrackResponseV3>({
		ctx,
		input: {
			customer_id: body.customer_id,
			entity_id: body.entity_id ?? undefined,
			value,
			balance: fundingBalances.length === 1 ? fundingBalances[0] : null,
			balances: balancesOf({
				ctx,
				fullSubject,
				featureIds: replies.map(({ featureId }) => featureId),
			}),
			deductions: replies.flatMap(({ reply }) =>
				trackReplyToDeductions({ reply, fullSubject }),
			),
		},
		targetVersion: ctx.apiVersion,
		resource: AffectedResource.Track,
		legacyData: { feature_id: body.feature_id || body.event_name || "" },
	});
}

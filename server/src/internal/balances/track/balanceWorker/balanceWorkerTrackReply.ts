import type { WorkerFullSubject } from "@autumn/balance-engine";
import type { TrackReply } from "@autumn/balance-worker-client";
import {
	AffectedResource,
	type ApiBalanceV1,
	applyResponseVersionChanges,
	type Customer,
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

/** One worker track and the feature it was sent for; an event name yields one per feature it maps to. */
export type FeatureTrackReply = {
	engine: "worker";
	featureId: string;
	reply: TrackReply;
};

/** One feature the worker refused, tracked on Postgres instead: the legacy response, unversioned, and the customer row it read. */
export type FeatureTrackPostgresResponse = {
	engine: "postgres";
	featureId: string;
	response: TrackResponseV3;
	customer: Customer;
};

export type FeatureTrackOutcome =
	| FeatureTrackReply
	| FeatureTrackPostgresResponse;

/** The pieces a response is assembled from, whichever engine produced them. */
type ResponseParts = {
	fundingBalances: ApiBalanceV1[];
	balances: Record<string, ApiBalanceV1 | null>;
	deductions: NonNullable<TrackResponseV3["deductions"]>;
};

const isWorkerReply = (
	outcome: FeatureTrackOutcome,
): outcome is FeatureTrackReply => outcome.engine === "worker";

const isPostgresResponse = (
	outcome: FeatureTrackOutcome,
): outcome is FeatureTrackPostgresResponse => outcome.engine === "postgres";

/** The legacy `balances` map: each tracked feature and the credit systems that can fund it, null where the customer holds none. */
const balancesOf = ({
	ctx,
	subjects,
}: {
	ctx: AutumnContext;
	subjects: { featureId: string; fullSubject: WorkerFullSubject }[];
}): Record<string, ApiBalanceV1 | null> => {
	const balances: Record<string, ApiBalanceV1 | null> = {};
	for (const { featureId, fullSubject } of subjects) {
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
	return balances;
};

const workerResponseParts = ({
	ctx,
	body,
	replies,
}: {
	ctx: AutumnContext;
	body: TrackParams;
	replies: FeatureTrackReply[];
}): ResponseParts => {
	const value = body.value ?? 1;
	// Each reply carries only the rows that fund its own feature, so every feature is read off the reply that tracked it.
	const subjects = replies.map(({ featureId, reply }) => ({
		featureId,
		fullSubject: workerReplyToFullSubject({
			state: reply.state,
			catalog: reply.catalog,
			entityId: body.entity_id,
		}),
	}));
	// The worker names the feature each balance is reported in: the tracked one, or the credit system funding it.
	const fundingFeatureIds: string[] = [];
	const fundingBalances: ApiBalanceV1[] = [];
	replies.forEach(({ reply }, index) => {
		const featureId = reply.result.fundingFeatureId;
		if (fundingFeatureIds.includes(featureId)) return;
		fundingFeatureIds.push(featureId);
		fundingBalances.push(
			workerStateToApiBalance({
				ctx,
				fullSubject: subjects[index].fullSubject,
				featureId,
			}),
		);
	});

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

	return {
		fundingBalances,
		balances: balancesOf({ ctx, subjects }),
		// The worker reports the per-balance breakdown with its decision, the same one its usage event carries.
		deductions: replies.flatMap(({ reply }) => reply.result.deductions),
	};
};

/** Postgres already answered in the API shape; its balance is the tracked feature's funding balance. */
const postgresResponseParts = ({
	responses,
}: {
	responses: FeatureTrackPostgresResponse[];
}): ResponseParts => ({
	fundingBalances: responses.flatMap(({ response }) =>
		response.balance ? [response.balance] : [],
	),
	balances: Object.assign(
		{},
		...responses.map(
			({ featureId, response }) =>
				response.balances ?? { [featureId]: response.balance },
		),
	),
	deductions: responses.flatMap(({ response }) => response.deductions ?? []),
});

/** The one place track outcomes, from either engine, become the API's track response. */
export function trackOutcomesToApiResponse({
	ctx,
	body,
	outcomes,
}: {
	ctx: AutumnContext;
	body: TrackParams;
	outcomes: FeatureTrackOutcome[];
}): TrackResponseV3 {
	const replies = outcomes.filter(isWorkerReply);
	const worker: ResponseParts =
		replies.length > 0
			? workerResponseParts({ ctx, body, replies })
			: { fundingBalances: [], balances: {}, deductions: [] };
	const postgres = postgresResponseParts({
		responses: outcomes.filter(isPostgresResponse),
	});
	const fundingBalances = [
		...worker.fundingBalances,
		...postgres.fundingBalances,
	];
	const balances = { ...worker.balances, ...postgres.balances };

	return applyResponseVersionChanges<TrackResponseV3>({
		ctx,
		input: {
			customer_id: body.customer_id,
			entity_id: body.entity_id ?? undefined,
			value: body.value ?? 1,
			balance: fundingBalances.length === 1 ? fundingBalances[0] : null,
			balances: Object.keys(balances).length < 2 ? undefined : balances,
			deductions: [...worker.deductions, ...postgres.deductions],
		},
		targetVersion: ctx.apiVersion,
		resource: AffectedResource.Track,
		legacyData: { feature_id: body.feature_id || body.event_name || "" },
	});
}

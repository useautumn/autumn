import { subjectStateToFullSubject } from "@autumn/balance-engine";
import {
	isFeatureHeld,
	isFlagFeatureId,
	workerStateToApiBalance,
	workerSubjectsToApiBalances,
} from "@autumn/balance-engine/api-renderer";
import type { TrackReply } from "@autumn/balance-worker-client";
import {
	AffectedResource,
	type ApiBalanceV1,
	applyResponseVersionChanges,
	type Customer,
	InsufficientBalanceError,
	type TrackParams,
	type TrackResponseV3,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

export type FeatureTrackReply = {
	engine: "worker";
	featureId: string;
	reply: TrackReply;
};

export type FeatureTrackPostgresResponse = {
	engine: "postgres";
	featureId: string;
	response: TrackResponseV3;
	customer: Customer;
};

export type FeatureTrackOutcome =
	| FeatureTrackReply
	| FeatureTrackPostgresResponse;

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
	const subjects = replies.map(({ featureId, reply }) => ({
		featureId,
		fullSubject: subjectStateToFullSubject({
			state: reply.state,
			catalog: reply.catalog,
			entityId: body.entity_id,
		}),
	}));
	const fundingBalances = new Map<string, ApiBalanceV1>();
	replies.forEach(({ reply }, index) => {
		const featureId = reply.result.fundingFeatureId;
		if (isFlagFeatureId({ ctx, featureId })) return;
		const { fullSubject } = subjects[index];
		if (!isFeatureHeld({ fullSubject, featureId })) return;
		const balance = workerStateToApiBalance({ ctx, fullSubject, featureId });
		if (balance) fundingBalances.set(featureId, balance);
	});

	const rejected = replies.find(
		({ reply }) => reply.result.status === "rejected",
	);
	if (rejected) {
		const fundingFeatureId = rejected.reply.result.fundingFeatureId;
		throw new InsufficientBalanceError({
			featureId: rejected.featureId,
			value,
			balance: fundingBalances.get(fundingFeatureId)?.remaining ?? 0,
		});
	}

	return {
		fundingBalances: [...fundingBalances.values()],
		balances: workerSubjectsToApiBalances({ ctx, subjects }),
		deductions: replies.flatMap(({ reply }) => reply.result.deductions),
	};
};

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
			event_name: body.event_name,
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

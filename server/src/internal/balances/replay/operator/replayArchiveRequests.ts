import type { CommandOrg } from "@autumn/balance-engine";
import type { ReplayManifestRequest } from "../manifest/replayManifestContracts.js";
import type { ReplayHydrationCoordinator } from "../replayHydrationContracts.js";
import { executeReplayRequest } from "./executeReplayRequest.js";
import { planReplayRequest } from "./planReplayRequest.js";
import {
	describeReplayFailureReason,
	REPLAY_CANCELLED_REASON,
	type ReplayArchiveClock,
	type ReplayContextReader,
	type ReplayRequestOutcome,
} from "./replayArchiveContracts.js";
import type {
	ReplayBlockedAdmission,
	ReplayCohortPlan,
} from "./replayArchivePrewarm.js";
import { runReplayLanes } from "./replayArchiveSchedule.js";
import type { ReplayStartPacer } from "./replayStartPacer.js";

export type ReplayRequestRecord = Readonly<{
	id: string;
	outcome: ReplayRequestOutcome;
}>;

/** Cancelled requests stay terminal and never reached the worker, so they are
 *  counted against setup rather than execution. */
const CANCELLED_OUTCOME: ReplayRequestOutcome = Object.freeze({
	kind: "failed",
	reason: REPLAY_CANCELLED_REASON,
	stage: "setup",
});

/** A blocked request is classified by shape alone, so any org settings do. */
const REVIEW_ORG_CONFIG: CommandOrg["config"] = {
	reverse_deduction_order: false,
	block_overdue_entitlements: false,
	include_past_due: true,
};

/** Shape is classified before the setup verdict, so an unsupported request
 *  stays visible even when its customer never hydrated. */
const classifyBlockedRequest = ({
	request,
	admission,
}: {
	request: ReplayManifestRequest;
	admission: ReplayBlockedAdmission;
}): ReplayRequestOutcome => {
	const planned = planReplayRequest({ request, orgConfig: REVIEW_ORG_CONFIG });
	if (planned.kind === "refused")
		return { kind: "refused", reason: planned.reason };
	if (admission.kind === "failed")
		return { kind: "failed", reason: admission.reason, stage: "setup" };
	return admission.category === undefined
		? { kind: "refused", reason: admission.reason }
		: {
				kind: "refused",
				reason: admission.reason,
				category: admission.category,
			};
};

const executeAdmittedRequest = async ({
	request,
	plan,
	coordinator,
	readContext,
	clock,
	signal,
}: {
	request: ReplayManifestRequest;
	plan: ReplayCohortPlan;
	coordinator: ReplayHydrationCoordinator;
	readContext: ReplayContextReader;
	clock: ReplayArchiveClock;
	signal: AbortSignal;
}): Promise<ReplayRequestOutcome> => {
	try {
		const result = await executeReplayRequest({
			request,
			selection: plan.selection,
			coordinator,
			readContext,
			signal,
			clock,
		});
		if (result.kind === "completed")
			return {
				kind: "completed",
				statusCode: result.statusCode,
				durationMs: result.durationMs,
				decision: result.decision,
			};
		if (result.kind === "refused")
			return { kind: "refused", reason: result.reason };
		return { kind: "failed", reason: result.reason, stage: "execution" };
	} catch (error) {
		return {
			kind: "failed",
			reason: describeReplayFailureReason({ error }),
			stage: "execution",
		};
	}
};

const replayRequest = async ({
	request,
	plan,
	coordinator,
	readContext,
	pacer,
	clock,
	signal,
}: {
	request: ReplayManifestRequest;
	plan: ReplayCohortPlan;
	coordinator: ReplayHydrationCoordinator;
	readContext: ReplayContextReader;
	pacer: ReplayStartPacer;
	clock: ReplayArchiveClock;
	signal: AbortSignal;
}): Promise<ReplayRequestOutcome> => {
	if (plan.admission.kind !== "ready")
		return classifyBlockedRequest({ request, admission: plan.admission });
	const started = await pacer.start({
		invoke: () =>
			executeAdmittedRequest({
				request,
				plan,
				coordinator,
				readContext,
				clock,
				signal,
			}),
	});
	return started.kind === "started" ? started.value : CANCELLED_OUTCOME;
};

const replayCohortRequests = async ({
	plan,
	coordinator,
	readContext,
	pacer,
	clock,
	signal,
}: {
	plan: ReplayCohortPlan;
	coordinator: ReplayHydrationCoordinator;
	readContext: ReplayContextReader;
	pacer: ReplayStartPacer;
	clock: ReplayArchiveClock;
	signal: AbortSignal;
}): Promise<readonly ReplayRequestRecord[]> => {
	const records: ReplayRequestRecord[] = [];
	for (const request of plan.cohort.requests) {
		const outcome = await replayRequest({
			request,
			plan,
			coordinator,
			readContext,
			pacer,
			clock,
			signal,
		});
		records.push({ id: request.id, outcome });
	}
	return records;
};

type ReplayLaneContext = Readonly<{
	coordinator: ReplayHydrationCoordinator;
	readContext: ReplayContextReader;
	pacer: ReplayStartPacer;
	clock: ReplayArchiveClock;
	signal: AbortSignal;
	byCohort: (readonly ReplayRequestRecord[])[];
}>;

const runReplayLaneItem = async ({
	item,
	context,
}: {
	item: { plan: ReplayCohortPlan; index: number };
	context: ReplayLaneContext;
}): Promise<void> => {
	context.byCohort[item.index] = await replayCohortRequests({
		plan: item.plan,
		coordinator: context.coordinator,
		readContext: context.readContext,
		pacer: context.pacer,
		clock: context.clock,
		signal: context.signal,
	});
};

/** Cohorts replay in manifest order with a bounded number of customers in
 *  flight; each customer's own requests stay strictly sequential. */
export async function replayCohorts({
	plans,
	coordinator,
	readContext,
	pacer,
	clock,
	concurrency,
	signal,
}: {
	plans: readonly ReplayCohortPlan[];
	coordinator: ReplayHydrationCoordinator;
	readContext: ReplayContextReader;
	pacer: ReplayStartPacer;
	clock: ReplayArchiveClock;
	concurrency: number;
	signal: AbortSignal;
}): Promise<ReadonlyMap<string, ReplayRequestOutcome>> {
	const byCohort: (readonly ReplayRequestRecord[])[] = [];
	const context: ReplayLaneContext = {
		coordinator,
		readContext,
		pacer,
		clock,
		signal,
		byCohort,
	};
	await runReplayLanes({
		items: plans.map((plan, index) => ({ plan, index })),
		laneCount: concurrency,
		run: ({ item }) => runReplayLaneItem({ item, context }),
	});
	const outcomes = new Map<string, ReplayRequestOutcome>();
	for (const records of byCohort)
		for (const record of records) outcomes.set(record.id, record.outcome);
	return outcomes;
}

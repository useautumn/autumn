import type {
	ReplayManifestBaseline,
	ReplayManifestCohort,
} from "../manifest/replayManifestContracts.js";
import type {
	ReplayHydrationCoordinator,
	ReplayHydrationResult,
	ReplayHydrationSelection,
} from "../replayHydrationContracts.js";
import { ReplayHydrationSourceRefusedError } from "../replayHydrationErrors.js";
import {
	describeReplayFailureReason,
	REPLAY_CANCELLED_REASON,
	REPLAY_NO_FEATURE_REASON,
	REPLAY_UNVERIFIED_BASELINE_REASON,
} from "./replayArchiveContracts.js";
import { runReplayLanes } from "./replayArchiveSchedule.js";

export type ReplayCohortAdmission =
	| Readonly<{ kind: "ready" }>
	| Readonly<{ kind: "excluded"; reason: string; category?: string }>
	| Readonly<{ kind: "failed"; reason: string }>;

export type ReplayBlockedAdmission = Exclude<
	ReplayCohortAdmission,
	{ kind: "ready" }
>;

export type ReplayCohortPlan = Readonly<{
	cohort: ReplayManifestCohort;
	selection: ReplayHydrationSelection;
	admission: ReplayCohortAdmission;
	result: ReplayHydrationResult | null;
}>;

export function buildReplaySelection({
	cohort,
	baseline,
}: {
	cohort: ReplayManifestCohort;
	baseline: ReplayManifestBaseline;
}): ReplayHydrationSelection {
	return {
		identity: {
			orgId: cohort.identity.orgId,
			env: cohort.identity.env,
			customerId: cohort.identity.customerId,
			entityId: null,
		},
		baseline: { id: baseline.id, capturedAtMs: baseline.capturedAtMs },
		featureIds: cohort.featureIds,
	};
}

/** Only a freshly initialized baseline admits a customer; every other verdict
 *  leaves the replayed numbers unverifiable. */
const admitPrewarmResult = ({
	result,
}: {
	result: ReplayHydrationResult;
}): ReplayCohortAdmission =>
	result.kind === "initialized" && result.freshParity
		? { kind: "ready" }
		: { kind: "excluded", reason: REPLAY_UNVERIFIED_BASELINE_REASON };

const admitPrewarmFailure = ({
	error,
}: {
	error: unknown;
}): ReplayCohortAdmission =>
	error instanceof ReplayHydrationSourceRefusedError
		? { kind: "excluded", reason: error.reason, category: error.category }
		: { kind: "failed", reason: describeReplayFailureReason({ error }) };

const prewarmCohort = async ({
	cohort,
	baseline,
	coordinator,
	signal,
}: {
	cohort: ReplayManifestCohort;
	baseline: ReplayManifestBaseline;
	coordinator: ReplayHydrationCoordinator;
	signal: AbortSignal;
}): Promise<ReplayCohortPlan> => {
	const selection = buildReplaySelection({ cohort, baseline });
	if (selection.featureIds.length === 0)
		return {
			cohort,
			selection,
			admission: {
				kind: "excluded",
				reason: REPLAY_NO_FEATURE_REASON,
				category: "unsupported",
			},
			result: null,
		};
	if (signal.aborted)
		return {
			cohort,
			selection,
			admission: { kind: "failed", reason: REPLAY_CANCELLED_REASON },
			result: null,
		};
	try {
		const result = await coordinator.prewarm({ selection, signal });
		return {
			cohort,
			selection,
			admission: admitPrewarmResult({ result }),
			result,
		};
	} catch (error) {
		return {
			cohort,
			selection,
			admission: admitPrewarmFailure({ error }),
			result: null,
		};
	}
};

type PrewarmLaneContext = Readonly<{
	baseline: ReplayManifestBaseline;
	coordinator: ReplayHydrationCoordinator;
	signal: AbortSignal;
	plans: ReplayCohortPlan[];
}>;

const runPrewarmLaneItem = async ({
	item,
	context,
}: {
	item: { cohort: ReplayManifestCohort; index: number };
	context: PrewarmLaneContext;
}): Promise<void> => {
	context.plans[item.index] = await prewarmCohort({
		cohort: item.cohort,
		baseline: context.baseline,
		coordinator: context.coordinator,
		signal: context.signal,
	});
};

/** Every prewarm settles before the caller measures anything, so hydration work
 *  never lands inside a measured request. */
export async function prewarmReplayCohorts({
	cohorts,
	baseline,
	coordinator,
	concurrency,
	signal,
}: {
	cohorts: readonly ReplayManifestCohort[];
	baseline: ReplayManifestBaseline;
	coordinator: ReplayHydrationCoordinator;
	concurrency: number;
	signal: AbortSignal;
}): Promise<readonly ReplayCohortPlan[]> {
	const plans: ReplayCohortPlan[] = [];
	const context: PrewarmLaneContext = { baseline, coordinator, signal, plans };
	await runReplayLanes({
		items: cohorts.map((cohort, index) => ({ cohort, index })),
		laneCount: concurrency,
		run: ({ item }) => runPrewarmLaneItem({ item, context }),
	});
	return plans;
}

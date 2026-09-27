import type { ReplayManifest } from "../manifest/replayManifestContracts.js";
import type {
	ReplayArchiveReport,
	ReplayArchiveTotals,
	ReplayPrewarmReport,
	ReplayPrewarmResultCounts,
	ReplayPrewarmStatus,
	ReplayRequestOutcome,
	ReplayRequestReport,
} from "./replayArchiveContracts.js";
import type { ReplayCohortPlan } from "./replayArchivePrewarm.js";

const PREWARM_RESULT_KINDS = [
	"initialized",
	"already_initialized",
	"duplicate",
	"already_ready",
] as const;

/** A request that reached no phase at all is still terminal in the report. */
const MISSING_OUTCOME: ReplayRequestOutcome = Object.freeze({
	kind: "failed",
	reason: "not_replayed",
	stage: "setup",
});

const createPrewarmResultCounts = (): ReplayPrewarmResultCounts =>
	Object.fromEntries(
		PREWARM_RESULT_KINDS.map((kind) => [kind, 0]),
	) as ReplayPrewarmResultCounts;

const buildRequestReports = ({
	manifest,
	outcomes,
}: {
	manifest: ReplayManifest;
	outcomes: ReadonlyMap<string, ReplayRequestOutcome>;
}): readonly ReplayRequestReport[] =>
	manifest.requests.map((request) => ({
		id: request.id,
		orgId: request.orgId,
		env: request.env,
		customerId: request.customerId,
		operation: request.operation,
		logicalTimestampMs: request.logicalTimestampMs,
		...(outcomes.get(request.id) ?? MISSING_OUTCOME),
	}));

const tallyTotals = ({
	requests,
}: {
	requests: readonly ReplayRequestReport[];
}): ReplayArchiveTotals => {
	const tally = {
		completed: 0,
		refused: 0,
		setupFailed: 0,
		executionFailed: 0,
	};
	for (const request of requests) {
		if (request.kind === "completed") tally.completed += 1;
		else if (request.kind === "refused") tally.refused += 1;
		else if (request.stage === "execution") tally.executionFailed += 1;
		else tally.setupFailed += 1;
	}
	return {
		selected: requests.length,
		admitted: tally.completed + tally.executionFailed,
		completed: tally.completed,
		refused: tally.refused,
		failed: tally.setupFailed + tally.executionFailed,
		setupFailed: tally.setupFailed,
		executionFailed: tally.executionFailed,
	};
};

const buildPrewarmStatus = ({
	plan,
}: {
	plan: ReplayCohortPlan;
}): ReplayPrewarmStatus => {
	const base = {
		orgId: plan.cohort.identity.orgId,
		env: plan.cohort.identity.env,
		customerId: plan.cohort.identity.customerId,
		requestCount: plan.cohort.requestCount,
	};
	const admission = plan.admission;
	if (admission.kind === "ready") return { ...base, status: "ready" };
	if (admission.kind === "failed")
		return { ...base, status: "failed", reason: admission.reason };
	return admission.category === undefined
		? { ...base, status: "excluded", reason: admission.reason }
		: {
				...base,
				status: "excluded",
				reason: admission.reason,
				category: admission.category,
			};
};

const buildPrewarmReport = ({
	plans,
}: {
	plans: readonly ReplayCohortPlan[];
}): ReplayPrewarmReport => {
	const results = createPrewarmResultCounts();
	const customers = {
		selected: plans.length,
		admitted: 0,
		excluded: 0,
		failed: 0,
	};
	for (const plan of plans) {
		if (plan.result !== null)
			results[plan.result.kind] = (results[plan.result.kind] ?? 0) + 1;
		if (plan.admission.kind === "ready") customers.admitted += 1;
		else if (plan.admission.kind === "excluded") customers.excluded += 1;
		else customers.failed += 1;
	}
	return {
		statuses: plans.map((plan) => buildPrewarmStatus({ plan })),
		customers,
		results,
	};
};

/** Results are collected by observation id and reported in manifest order. */
export function buildReplayArchiveReport({
	manifest,
	plans,
	outcomes,
	prewarmDurationMs,
	measuredDurationMs,
}: {
	manifest: ReplayManifest;
	plans: readonly ReplayCohortPlan[];
	outcomes: ReadonlyMap<string, ReplayRequestOutcome>;
	prewarmDurationMs: number;
	measuredDurationMs: number;
}): ReplayArchiveReport {
	const requests = buildRequestReports({ manifest, outcomes });
	return {
		measurement: "client_to_worker",
		clock: "rebased",
		prewarmDurationMs,
		measuredDurationMs,
		totals: tallyTotals({ requests }),
		prewarm: buildPrewarmReport({ plans }),
		requests,
	};
}

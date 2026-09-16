import type {
	CheckDecision,
	MeteringIdentity,
	TrackDecision,
} from "@autumn/balance-engine";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { BalanceHydrationResult } from "../../hydration/balanceHydrationContracts.js";
import type {
	ReplayEnvironment,
	ReplayOperation,
} from "../manifest/replayManifestContracts.js";
import { describeReplayOperatorError } from "./replayOperatorErrors.js";

/** A customer whose baseline could not be proven fresh is never replayed. */
export const REPLAY_UNVERIFIED_BASELINE_REASON = "unverified_baseline";

/** A cohort with no concrete feature has nothing to hydrate. */
export const REPLAY_NO_FEATURE_REASON = "no_feature_selected";

export const REPLAY_CANCELLED_REASON = "cancelled";

export type ReplayContextReader = (params: {
	identity: MeteringIdentity;
}) => AutumnContext;

export type ReplayArchiveConfig = Readonly<{
	concurrency?: number;
	requestsPerSecond?: number;
}>;

export type ReplayArchiveClock = Readonly<{
	now: () => number;
	sleep: (params: {
		durationMs: number;
		signal?: AbortSignal;
	}) => Promise<void>;
}>;

/** `setup` covers every request that never reached the worker, `execution` the
 *  ones the worker answered with a failure. */
export type ReplayRequestFailureStage = "setup" | "execution";

export type ReplayRequestOutcome =
	| Readonly<{
			kind: "completed";
			statusCode: number;
			durationMs: number;
			decision: CheckDecision | TrackDecision;
	  }>
	| Readonly<{ kind: "refused"; reason: string; category?: string }>
	| Readonly<{
			kind: "failed";
			reason: string;
			stage: ReplayRequestFailureStage;
	  }>;

/** Reports carry identity and provenance only; archived bodies and worker
 *  replies never leave the operator. */
export type ReplayRequestIdentity = Readonly<{
	id: string;
	orgId: string;
	env: ReplayEnvironment;
	customerId: string;
	operation: ReplayOperation;
	logicalTimestampMs: number;
}>;

export type ReplayRequestReport = ReplayRequestIdentity & ReplayRequestOutcome;

export type ReplayPrewarmStatus = Readonly<{
	orgId: string;
	env: ReplayEnvironment;
	customerId: string;
	requestCount: number;
	status: "ready" | "excluded" | "failed";
	reason?: string;
	category?: string;
}>;

export type ReplayPrewarmResultCounts = Record<
	BalanceHydrationResult["kind"],
	number
>;

export type ReplayPrewarmReport = Readonly<{
	statuses: readonly ReplayPrewarmStatus[];
	customers: Readonly<{
		selected: number;
		admitted: number;
		excluded: number;
		failed: number;
	}>;
	results: ReplayPrewarmResultCounts;
}>;

export type ReplayArchiveTotals = Readonly<{
	selected: number;
	admitted: number;
	completed: number;
	refused: number;
	failed: number;
	setupFailed: number;
	executionFailed: number;
}>;

export type ReplayArchiveReport = Readonly<{
	measurement: "client_to_worker";
	clock: "rebased";
	prewarmDurationMs: number;
	measuredDurationMs: number;
	totals: ReplayArchiveTotals;
	prewarm: ReplayPrewarmReport;
	requests: readonly ReplayRequestReport[];
}>;

export function describeReplayFailureReason({
	error,
}: {
	error: unknown;
}): string {
	const described = describeReplayOperatorError({ error });
	if (described.reason !== undefined) return described.reason;
	return described.code === undefined
		? described.name
		: `${described.name} (${described.code})`;
}

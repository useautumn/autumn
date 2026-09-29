import type {
	CheckCommand,
	MeteringIdentity,
	TrackCommand,
} from "@autumn/balance-engine";
import {
	BalanceWorkerClientError,
	type CheckReply,
	type TrackReply,
} from "@autumn/balance-worker-client";
import { InsufficientBalanceError } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { ReplayManifestRequest } from "../manifest/replayManifestContracts.js";
import type {
	ReplayHydrationCoordinator,
	ReplayHydrationSelection,
} from "../replayHydrationContracts.js";
import { ReplayHydrationSourceRefusedError } from "../replayHydrationErrors.js";
import {
	planReplayRequest,
	type ReplayCheckPlan,
	type ReplayTrackPlan,
	replayRefusalReasonOf,
} from "./planReplayRequest.js";

export type ReplayReadContext = (params: {
	identity: MeteringIdentity;
}) => AutumnContext;

export type ReplayExecutionClock = Readonly<{ now: () => number }>;

export type ReplayExecutionResult =
	| Readonly<{
			kind: "completed";
			decision: CheckReply | TrackReply;
			reply: unknown;
			statusCode: number;
			durationMs: number;
	  }>
	| Readonly<{ kind: "refused"; reason: string }>
	| Readonly<{ kind: "failed"; reason: string }>;

type ReplayDispatch =
	| Readonly<{
			kind: "check";
			command: CheckCommand;
			decision: CheckReply;
	  }>
	| Readonly<{
			kind: "track";
			command: TrackCommand;
			decision: TrackReply;
	  }>;

const DEFAULT_CLOCK: ReplayExecutionClock = { now: () => performance.now() };

async function dispatchReplayPlan({
	plan,
	selection,
	coordinator,
	signal,
}: {
	plan: ReplayCheckPlan | ReplayTrackPlan;
	selection: ReplayHydrationSelection;
	coordinator: ReplayHydrationCoordinator;
	signal?: AbortSignal;
}): Promise<ReplayDispatch> {
	if (plan.kind === "check")
		return {
			kind: "check",
			command: plan.command,
			decision: await coordinator.check({
				selection,
				command: plan.command,
				signal,
			}),
		};
	return {
		kind: "track",
		command: plan.command,
		decision: await coordinator.track({
			selection,
			command: plan.command,
			signal,
		}),
	};
}

/** The archive keeps the worker's decision itself; projecting an API balance would need a FullSubject the replay does not load. */
function replayDecisionReply({
	dispatch,
}: {
	dispatch: ReplayDispatch;
}): unknown {
	return dispatch.decision;
}

function completeReplayDispatch({
	dispatch,
	durationMs,
}: {
	dispatch: ReplayDispatch;
	durationMs: number;
}): ReplayExecutionResult {
	try {
		return {
			kind: "completed",
			decision: dispatch.decision,
			reply: replayDecisionReply({ dispatch }),
			statusCode: 200,
			durationMs,
		};
	} catch (cause) {
		// A rejected balance is a business outcome, not an execution failure.
		if (!(cause instanceof InsufficientBalanceError)) throw cause;
		return {
			kind: "completed",
			decision: dispatch.decision,
			reply: { message: cause.message, code: cause.code },
			statusCode: cause.statusCode,
			durationMs,
		};
	}
}

function safeErrorReasonOf({ cause }: { cause: unknown }): string {
	if (!(cause instanceof Error)) return "unknown_error";
	const code: unknown = (cause as { code?: unknown }).code;
	return typeof code === "string" && code.length > 0 ? code : cause.name;
}

function replayExecutionErrorOf({
	cause,
}: {
	cause: unknown;
}): ReplayExecutionResult {
	if (cause instanceof ReplayHydrationSourceRefusedError)
		return { kind: "refused", reason: cause.reason };
	// The engine could not decide the command: a verdict for the archive, not a failure.
	if (
		cause instanceof BalanceWorkerClientError &&
		cause.workerCode === "UNSUPPORTED_COMMAND"
	)
		return {
			kind: "refused",
			reason: cause.workerReason ?? "unsupported_command",
		};
	const refusal = replayRefusalReasonOf({ cause });
	if (refusal !== undefined) return { kind: "refused", reason: refusal };
	return { kind: "failed", reason: safeErrorReasonOf({ cause }) };
}

export async function executeReplayRequest({
	request,
	selection,
	coordinator,
	readContext,
	signal,
	clock = DEFAULT_CLOCK,
}: {
	request: ReplayManifestRequest;
	selection: ReplayHydrationSelection;
	coordinator: ReplayHydrationCoordinator;
	readContext: ReplayReadContext;
	signal?: AbortSignal;
	clock?: ReplayExecutionClock;
}): Promise<ReplayExecutionResult> {
	const { org, features } = readContext({ identity: selection.identity });
	const plan = planReplayRequest({ request, orgConfig: org.config, features });
	if (plan.kind === "refused") return plan;
	const startedAt = clock.now();
	try {
		const dispatch = await dispatchReplayPlan({
			plan,
			selection,
			coordinator,
			signal,
		});
		return completeReplayDispatch({
			dispatch,
			durationMs: clock.now() - startedAt,
		});
	} catch (cause) {
		return replayExecutionErrorOf({ cause });
	}
}

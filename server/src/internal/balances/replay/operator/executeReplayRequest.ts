import type {
	CheckCommand,
	CheckDecision,
	MeteringIdentity,
	TrackCommand,
	TrackDecision,
} from "@autumn/balance-engine";
import { InsufficientBalanceError } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { checkDecisionToCheckResponse } from "../../check/balanceWorker/balanceWorkerCheckResponse.js";
import type {
	BalanceHydrationCoordinator,
	BalanceHydrationSelection,
} from "../../hydration/balanceHydrationContracts.js";
import { BalanceHydrationSourceRefusedError } from "../../hydration/balanceHydrationErrors.js";
import { trackDecisionToTrackResponse } from "../../track/balanceWorker/balanceWorkerTrackResponse.js";
import type { ReplayManifestRequest } from "../manifest/replayManifestContracts.js";
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
			decision: CheckDecision | TrackDecision;
			reply: unknown;
			statusCode: number;
			durationMs: number;
	  }>
	| Readonly<{ kind: "refused"; reason: string }>
	| Readonly<{ kind: "failed"; reason: string }>;

type ReplayDispatch =
	| Readonly<{ kind: "check"; command: CheckCommand; decision: CheckDecision }>
	| Readonly<{ kind: "track"; command: TrackCommand; decision: TrackDecision }>;

const DEFAULT_CLOCK: ReplayExecutionClock = { now: () => performance.now() };

async function dispatchReplayPlan({
	plan,
	selection,
	coordinator,
	signal,
}: {
	plan: ReplayCheckPlan | ReplayTrackPlan;
	selection: BalanceHydrationSelection;
	coordinator: BalanceHydrationCoordinator;
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

function replayResponseContext({
	request,
	identity,
	readContext,
}: {
	request: ReplayManifestRequest;
	identity: MeteringIdentity;
	readContext: ReplayReadContext;
}): AutumnContext {
	return {
		...readContext({ identity }),
		id: request.id,
		timestamp: request.logicalTimestampMs,
	};
}

function replayDecisionReply({
	ctx,
	dispatch,
}: {
	ctx: AutumnContext;
	dispatch: ReplayDispatch;
}): unknown {
	return dispatch.kind === "check"
		? checkDecisionToCheckResponse({
				ctx,
				command: dispatch.command,
				decision: dispatch.decision,
			})
		: trackDecisionToTrackResponse({ ctx, decision: dispatch.decision });
}

function completeReplayDispatch({
	request,
	dispatch,
	readContext,
	durationMs,
}: {
	request: ReplayManifestRequest;
	dispatch: ReplayDispatch;
	readContext: ReplayReadContext;
	durationMs: number;
}): ReplayExecutionResult {
	try {
		return {
			kind: "completed",
			decision: dispatch.decision,
			reply: replayDecisionReply({
				ctx: replayResponseContext({
					request,
					identity: dispatch.command.identity,
					readContext,
				}),
				dispatch,
			}),
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
	if (cause instanceof BalanceHydrationSourceRefusedError)
		return { kind: "refused", reason: cause.reason };
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
	selection: BalanceHydrationSelection;
	coordinator: BalanceHydrationCoordinator;
	readContext: ReplayReadContext;
	signal?: AbortSignal;
	clock?: ReplayExecutionClock;
}): Promise<ReplayExecutionResult> {
	const plan = planReplayRequest({ request });
	if (plan.kind === "refused") return plan;
	const startedAt = clock.now();
	try {
		const dispatch = await dispatchReplayPlan({
			plan,
			selection,
			coordinator,
			signal,
		});
		if (dispatch.decision.kind === "unsupported")
			return { kind: "refused", reason: dispatch.decision.reason };
		return completeReplayDispatch({
			request,
			dispatch,
			readContext,
			durationMs: clock.now() - startedAt,
		});
	} catch (cause) {
		return replayExecutionErrorOf({ cause });
	}
}

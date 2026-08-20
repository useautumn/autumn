import { ms } from "@autumn/shared";
import { db } from "../../../../lib/db.js";
import { logger } from "../../../../lib/logger.js";
import { isErrorResult } from "../../../approvals/utils/approvalErrors.js";
import {
	EveStreamIdleTimeoutError,
	streamEveEvents,
} from "../../eve/client.js";
import type { EveEvent } from "../../eve/eveEventSchemas.js";
import { labelForAction, labelForResult } from "../../eve/events.js";
import {
	classifyParkedEveInput,
	type WithheldWrite,
} from "../../eve/parkedInput.js";
import { upsertEveSession } from "../../eve/repo.js";
import type { EveAuthContext, EveSessionRef } from "../../eve/types.js";
import { normalizeToolName } from "../../tools/toolPolicy.js";
import type { ResumedAgentTurn } from "./types.js";

const FAILED_ACTION_STATUSES = new Set(["error", "failed", "rejected"]);

/** The MCP result text is JSON; an API failure lives inside it as a
 * `{message, code}` record even when the outer status says completed. */
const parsedResultText = (output: unknown): unknown => {
	const text = (output as { content?: Array<{ text?: string }> })?.content?.[0]
		?.text;
	if (typeof text !== "string") return undefined;
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
};

/** Eve explains a write it did not run — denied, ignored, invalid option —
 * inside the result payload; surface that or the failure is undiagnosable. */
const rejectionDetail = (output: unknown) => {
	const record = output as
		| { approval?: { status?: string }; code?: string; message?: string }
		| undefined;
	if (!record || typeof record !== "object") return undefined;
	const detail = {
		approval_status: record.approval?.status,
		code: record.code,
		message: record.message,
	};
	return Object.values(detail).some(Boolean) ? detail : undefined;
};

const isFailedActionResult = (event: {
	result?: { output?: unknown };
	status?: string;
}) => {
	if (event.status && FAILED_ACTION_STATUSES.has(event.status)) return true;
	const output = event.result?.output;
	return isErrorResult(output) || isErrorResult(parsedResultText(output));
};

const CHILD_REPLAY_IDLE_TIMEOUT_MS = ms.seconds(15);
/** Delegated children work in silence on the parent stream, so a resumed turn
 * can be quiet for minutes before the next park or result arrives. */
const RESUME_IDLE_TIMEOUT_MS = ms.minutes(5);

/** Replays a completed child session's stream from the start, feeding its
 * action events to the caller. Task-mode children end with session.completed,
 * so the replay is finite; a live child ends at the idle timeout instead. */
const applyChildStreamResults = async ({
	auth,
	childSessionId,
	onRequested,
	onResult,
	session,
}: {
	auth: EveAuthContext;
	childSessionId: string;
	onRequested: (
		event: Extract<EveEvent, { type: "actions.requested" }>,
	) => void;
	onResult: (event: Extract<EveEvent, { type: "action.result" }>) => void;
	session: EveSessionRef;
}) => {
	const childSession: EveSessionRef = {
		env: session.env,
		newSession: false,
		sessionId: childSessionId,
		state: { ...session.state, continuationToken: "", streamIndex: 0 },
		threadKey: session.threadKey,
	};
	try {
		for await (const event of streamEveEvents({
			auth,
			idleTimeoutMs: CHILD_REPLAY_IDLE_TIMEOUT_MS,
			session: childSession,
		})) {
			if (event.type === "actions.requested") onRequested(event);
			if (event.type === "action.result") onResult(event);
			if (
				event.type === "session.completed" ||
				event.type === "session.failed"
			) {
				break;
			}
		}
	} catch (error) {
		if (!(error instanceof EveStreamIdleTimeoutError)) throw error;
	}
};

export const consumeResumedAgentTurn = async ({
	auth,
	childSessionIds = [],
	expectedToolNames,
	orgId,
	session,
	skipRequestId,
}: {
	auth: EveAuthContext;
	/** The writes the user approved, in apply order; their results are the only
	 * proof each one ran. */
	expectedToolNames?: ReadonlyArray<string>;
	/** Child sessions the turn delegated to before parking. A proxied write
	 * executes there, so its proof lives on the child stream. */
	childSessionIds?: ReadonlyArray<string>;
	orgId: string;
	session: EveSessionRef;
	skipRequestId?: string;
}): Promise<ResumedAgentTurn> => {
	let text = "";
	let pendingText = "";
	let chained: ResumedAgentTurn["chained"];
	let chainedSiblingRequestIds: ReadonlyArray<string> = [];
	let chainedWithheld: ReadonlyArray<WithheldWrite> = [];
	let question: ResumedAgentTurn["question"];
	let sawEvent = false;
	let sawTurnActivity = false;
	let turnStarted = false;
	const expectedSteps = (expectedToolNames ?? []).map((toolName) => ({
		normalized: normalizeToolName(toolName),
		reserved: false,
		status: "pending" as "applied" | "failed" | "pending",
		toolName,
	}));
	const approvedCallIds = new Map<string, number>();
	// Each requested call reserves the next free step of its tool, so N calls
	// of one tool map to N distinct steps rather than all onto the first.
	const reserveStepFor = (name?: string) => {
		if (!name) return -1;
		const normalized = normalizeToolName(name);
		const index = expectedSteps.findIndex(
			(step) => !step.reserved && step.normalized === normalized,
		);
		if (index >= 0) expectedSteps[index].reserved = true;
		return index;
	};
	// A result with an unknown callId (Eve executed before the stream opened,
	// or a retry) lands on the first step of its tool that has not applied yet.
	const unresolvedStepFor = (name?: string) => {
		if (!name) return -1;
		const normalized = normalizeToolName(name);
		return expectedSteps.findIndex(
			(step) => step.status !== "applied" && step.normalized === normalized,
		);
	};
	const recordRequestedActions = (
		event: Extract<EveEvent, { type: "actions.requested" }>,
	) => {
		for (const action of event.actions) {
			const index = reserveStepFor(labelForAction(action));
			if (index >= 0 && action.callId) {
				approvedCallIds.set(action.callId, index);
			}
		}
	};
	const recordActionResult = (
		event: Extract<EveEvent, { type: "action.result" }>,
	) => {
		const callId = event.result?.callId;
		const index = callId
			? (approvedCallIds.get(callId) ??
				unresolvedStepFor(labelForResult(event.result)))
			: unresolvedStepFor(labelForResult(event.result));
		const step = index >= 0 ? expectedSteps[index] : undefined;
		if (step) {
			step.status = isFailedActionResult(event) ? "failed" : "applied";
		}
	};
	for await (const event of streamEveEvents({
		auth,
		idleTimeoutMs: RESUME_IDLE_TIMEOUT_MS,
		session,
	})) {
		sawEvent = true;
		session.state.streamIndex += 1;
		session.state.lastEventAt = Date.now();
		if (
			event.type === "step.started" ||
			event.type === "actions.requested" ||
			event.type === "action.result" ||
			event.type === "input.requested" ||
			event.type === "subagent.completed"
		) {
			sawTurnActivity = true;
		}
		if (event.type === "actions.requested") {
			recordRequestedActions(event);
		}
		if (event.type === "action.result") {
			logger.info("Resumed tool completed", {
				event: "leaf.eve_resumed_tool_completed",
				data: {
					call_id: event.result?.callId,
					failed: isFailedActionResult(event),
					rejection: rejectionDetail(event.result?.output),
					status: event.status,
					tool: event.result?.toolName,
				},
			});
		}
		if (event.type === "action.result") {
			recordActionResult(event);
		}
		if (event.type === "turn.started") {
			turnStarted = true;
		} else if (event.type === "input.requested") {
			const parkedInput = classifyParkedEveInput({
				requests: event.requests,
				skipRequestId,
			});
			logger.info("Resumed turn parked input", {
				event: "leaf.eve_resumed_park",
				data: {
					kind: parkedInput?.kind,
					request_count: event.requests.length,
					tools: event.requests.map((request) => request.action?.toolName),
					withheld:
						parkedInput?.kind === "gated" ? parkedInput.withheld.length : 0,
				},
			});
			if (parkedInput?.kind === "gated") {
				chained = parkedInput.chained;
				chainedSiblingRequestIds = parkedInput.siblingRequestIds;
				chainedWithheld = parkedInput.withheld;
				break;
			}
			if (parkedInput?.kind === "question") {
				question = parkedInput.question;
				session.state.status = "waiting";
				break;
			}
			if (parkedInput) {
				if (!(text || pendingText)) text = parkedInput.text;
				session.state.status = "waiting";
				break;
			}
		} else if (
			event.type === "message.appended" &&
			(turnStarted || sawTurnActivity)
		) {
			sawTurnActivity = true;
			const messageSoFar = event.messageSoFar;
			pendingText =
				typeof messageSoFar === "string"
					? messageSoFar
					: `${pendingText}${event.messageDelta}`;
		} else if (
			event.type === "message.completed" &&
			(turnStarted || sawTurnActivity)
		) {
			sawTurnActivity = true;
			if (event.finishReason !== "tool-calls") {
				text = event.message || pendingText;
			}
			pendingText = "";
		} else if (
			(turnStarted || sawTurnActivity) &&
			(event.type === "session.waiting" || event.type === "session.completed")
		) {
			session.state.status =
				event.type === "session.completed" ? "completed" : "waiting";
			break;
		} else if (
			(turnStarted || sawTurnActivity) &&
			(event.type === "turn.failed" || event.type === "session.failed")
		) {
			session.state.status = "failed";
			throw new Error(event.message);
		}
	}
	if (sawEvent) {
		await upsertEveSession({
			db,
			env: session.env,
			orgId,
			sessionId: session.sessionId,
			state: session.state,
			threadKey: session.threadKey,
		});
	}
	// Writes delegated to a subagent report their results on the child's
	// stream only; replay each child to prove the approved steps ran there.
	for (const childSessionId of childSessionIds) {
		if (expectedSteps.every((step) => step.status === "applied")) break;
		try {
			await applyChildStreamResults({
				auth,
				childSessionId,
				onRequested: recordRequestedActions,
				onResult: recordActionResult,
				session,
			});
		} catch (error) {
			logger.warn("Could not verify steps from the child session", {
				event: "leaf.eve_child_verification_failed",
				data: {
					child_session_id: childSessionId,
					error: error instanceof Error ? error.message : String(error),
				},
			});
		}
	}
	const steps = expectedSteps.map(({ status, toolName }) => ({
		status,
		toolName,
	}));
	return {
		approvedWriteFailed: steps.some((step) => step.status === "failed"),
		// Without a result for the approved tool there is no proof it ran, so an
		// unrelated tool or a bare reply must not read as success.
		approvedWriteUnverified:
			expectedSteps.length > 0 &&
			!expectedSteps.some((step) => step.status === "applied"),
		chained,
		chainedSiblingRequestIds,
		chainedWithheld,
		deferredEmptyTurn: turnStarted && !(sawTurnActivity || text || pendingText),
		question,
		steps,
		text: text || pendingText,
	};
};

import { db } from "../../../../lib/db.js";
import { logger } from "../../../../lib/logger.js";
import { isErrorResult } from "../../../approvals/utils/approvalErrors.js";
import { streamEveEvents } from "../../eve/client.js";
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

const isFailedActionResult = (event: {
	result?: { output?: unknown };
	status?: string;
}) => {
	if (event.status && FAILED_ACTION_STATUSES.has(event.status)) return true;
	const output = event.result?.output;
	return isErrorResult(output) || isErrorResult(parsedResultText(output));
};

export const consumeResumedAgentTurn = async ({
	auth,
	expectedToolNames,
	orgId,
	session,
	skipRequestId,
}: {
	auth: EveAuthContext;
	/** The writes the user approved, in apply order; their results are the only
	 * proof each one ran. */
	expectedToolNames?: ReadonlyArray<string>;
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
	for await (const event of streamEveEvents({ auth, session })) {
		sawEvent = true;
		session.state.streamIndex += 1;
		session.state.lastEventAt = Date.now();
		if (
			event.type === "step.started" ||
			event.type === "actions.requested" ||
			event.type === "action.result" ||
			event.type === "input.requested"
		) {
			sawTurnActivity = true;
		}
		if (event.type === "actions.requested" && expectedSteps.length) {
			for (const action of event.actions) {
				const index = reserveStepFor(labelForAction(action));
				if (index >= 0 && action.callId) {
					approvedCallIds.set(action.callId, index);
				}
			}
		}
		if (event.type === "action.result") {
			logger.info("Resumed tool completed", {
				event: "leaf.eve_resumed_tool_completed",
				data: {
					call_id: event.result?.callId,
					failed: isFailedActionResult(event),
					status: event.status,
					tool: event.result?.toolName,
				},
			});
		}
		if (event.type === "action.result" && expectedSteps.length) {
			const callId = event.result?.callId;
			const index = callId
				? (approvedCallIds.get(callId) ??
					unresolvedStepFor(labelForResult(event.result)))
				: unresolvedStepFor(labelForResult(event.result));
			const step = index >= 0 ? expectedSteps[index] : undefined;
			if (step) {
				step.status = isFailedActionResult(event) ? "failed" : "applied";
			}
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
		} else if (event.type === "message.appended" && turnStarted) {
			sawTurnActivity = true;
			const messageSoFar = event.messageSoFar;
			pendingText =
				typeof messageSoFar === "string"
					? messageSoFar
					: `${pendingText}${event.messageDelta}`;
		} else if (event.type === "message.completed" && turnStarted) {
			sawTurnActivity = true;
			if (event.finishReason !== "tool-calls") {
				text = event.message || pendingText;
			}
			pendingText = "";
		} else if (
			turnStarted &&
			(event.type === "session.waiting" || event.type === "session.completed")
		) {
			session.state.status =
				event.type === "session.completed" ? "completed" : "waiting";
			break;
		} else if (
			turnStarted &&
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
		steps,
		chained,
		chainedSiblingRequestIds,
		chainedWithheld,
		deferredEmptyTurn: turnStarted && !(sawTurnActivity || text || pendingText),
		question,
		text: text || pendingText,
	};
};

import { normalizeToolName } from "../../agent/tools/toolPolicy.js";
import { WAITING_FOR_INPUT_MESSAGE } from "../../ui/messages.js";
import { type EveInputRequest, textForInputRequests } from "./events.js";

/** A gated write the resumed turn parked on after the answered one. */
export type ChainedPendingRequest = {
	input?: Record<string, unknown>;
	options?: { id?: string; label?: string }[];
	requestId: string;
	toolName: string;
};

/** An optioned ask_question the resumed turn parked on. */
export type PendingQuestion = {
	options: { id?: string; label?: string }[];
	prompt: string;
	requestId: string;
};

export type ParkedEveInput =
	| {
			/** Every approval-gated write eve parked in this batch — one card
			 * decides them together, so none is left behind as a sibling. */
			gated: ChainedPendingRequest[];
			kind: "gated";
	  }
	| { kind: "question"; question: PendingQuestion }
	| { kind: "waiting"; text: string };

type ApprovalShapedRequest = EveInputRequest & {
	action: { toolName: string };
	requestId: string;
};

// Eve's built-in `ask_question` also carries a populated `action.toolName`
// (its own), so exclude it — only a real approval-gated tool call is a write.
const isApprovalShaped = (
	request: EveInputRequest,
): request is ApprovalShapedRequest =>
	Boolean(request.requestId) &&
	Boolean(request.action?.toolName) &&
	normalizeToolName(request.action?.toolName ?? "") !== "ask_question";

const SIBLING_REQUEST_IDS_KEY = "_eveSiblingRequestIds";

/** The batch siblings a park stashed on its stored tool args. Rows written
 * before the key existed simply have none. */
export const siblingRequestIdsFromToolArgs = (toolArgs: unknown): string[] => {
	if (!toolArgs || typeof toolArgs !== "object") return [];
	const stored = (toolArgs as Record<string, unknown>)[SIBLING_REQUEST_IDS_KEY];
	if (!Array.isArray(stored)) return [];
	return stored.filter((id): id is string => typeof id === "string");
};

/**
 * What a resumed turn is parked on, ignoring the requests just answered. A park
 * that is neither a gated write nor an optioned question still blocks the run,
 * so it is surfaced as text — dropping it orphans the request forever.
 */
export const classifyParkedEveInput = ({
	requests,
	skipRequestIds,
}: {
	requests: EveInputRequest[];
	skipRequestIds?: Set<string>;
}): ParkedEveInput | undefined => {
	// Guarded on skipRequestIds: an unconditional filter drops every id-less
	// request, orphaning the very parks this exists to surface.
	const pending = skipRequestIds?.size
		? requests.filter(
				(request) =>
					!(request.requestId && skipRequestIds.has(request.requestId)),
			)
		: requests;
	if (pending.length === 0) return undefined;

	const gated = pending.filter(isApprovalShaped);
	if (gated.length > 0) {
		return {
			gated: gated.map((request) => ({
				input: request.action.input,
				options: request.options,
				requestId: request.requestId,
				toolName: request.action.toolName,
			})),
			kind: "gated",
		};
	}

	const optioned = pending.find(
		(request) => request.prompt && (request.options?.length ?? 0) > 0,
	);
	if (optioned?.requestId && optioned.prompt) {
		return {
			kind: "question",
			question: {
				options: optioned.options ?? [],
				prompt: optioned.prompt,
				requestId: optioned.requestId,
			},
		};
	}

	return {
		kind: "waiting",
		text: textForInputRequests(pending) || WAITING_FOR_INPUT_MESSAGE,
	};
};

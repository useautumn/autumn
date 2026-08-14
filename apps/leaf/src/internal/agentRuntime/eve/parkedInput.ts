import { WAITING_FOR_INPUT_MESSAGE } from "../../../ui/messages.js";
import { normalizeToolName } from "../tools/toolPolicy.js";
import type { EveInputRequest } from "./eveEventSchemas.js";
import { textForInputRequests } from "./events.js";

export type ChainedPendingRequest = Readonly<{
	input?: Record<string, unknown>;
	options?: ReadonlyArray<Readonly<{ id?: string; label?: string }>>;
	requestId: string;
	toolName: string;
}>;

export type PendingQuestion = Readonly<{
	options: ReadonlyArray<Readonly<{ id?: string; label?: string }>>;
	prompt: string;
	requestId: string;
}>;

export type ParkedEveInput =
	| Readonly<{
			chained: ChainedPendingRequest;
			kind: "gated";
			siblingRequestIds: ReadonlyArray<string>;
	  }>
	| Readonly<{ kind: "question"; question: PendingQuestion }>
	| Readonly<{ kind: "waiting"; text: string }>;

type ApprovalShapedRequest = EveInputRequest & {
	action: { toolName: string };
	requestId: string;
};

const isApprovalShaped = (
	request: EveInputRequest,
): request is ApprovalShapedRequest =>
	Boolean(request.requestId) &&
	Boolean(request.action?.toolName) &&
	normalizeToolName(request.action?.toolName ?? "") !== "ask_question";

const SIBLING_REQUEST_IDS_KEY = "_eveSiblingRequestIds";

export const siblingRequestIdsFromToolArgs = (
	toolArgs: unknown,
): ReadonlyArray<string> => {
	if (!toolArgs || typeof toolArgs !== "object") return [];
	const stored = (toolArgs as Record<string, unknown>)[SIBLING_REQUEST_IDS_KEY];
	if (!Array.isArray(stored)) return [];
	return stored.filter((id): id is string => typeof id === "string");
};

export const classifyParkedEveInput = ({
	requests,
	skipRequestId,
}: {
	requests: ReadonlyArray<EveInputRequest>;
	skipRequestId?: string;
}): ParkedEveInput | undefined => {
	const pending = skipRequestId
		? requests.filter((request) => request.requestId !== skipRequestId)
		: requests;
	if (pending.length === 0) return undefined;

	const [gated, ...siblings] = pending.filter(isApprovalShaped);
	if (gated) {
		return {
			chained: {
				input: gated.action.input,
				options: gated.options,
				requestId: gated.requestId,
				toolName: gated.action.toolName,
			},
			kind: "gated",
			siblingRequestIds: siblings.map((request) => request.requestId),
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

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

export type WithheldWrite = Readonly<{
	input?: Record<string, unknown>;
	/** Backfilled when the approval is created, so the card can render this
	 * step with the same body as a standalone write. */
	preview?: unknown;
	requestId: string;
	toolName: string;
}>;

export type ParkedEveInput =
	| Readonly<{
			chained: ChainedPendingRequest;
			kind: "gated";
			siblingRequestIds: ReadonlyArray<string>;
			withheld: ReadonlyArray<WithheldWrite>;
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
const WITHHELD_WRITES_KEY = "_eveWithheldWrites";

export const withheldWritesFromToolArgs = (
	toolArgs: unknown,
): ReadonlyArray<WithheldWrite> => {
	if (!toolArgs || typeof toolArgs === "string") return [];
	const stored = (toolArgs as Record<string, unknown>)[WITHHELD_WRITES_KEY];
	if (!Array.isArray(stored)) return [];
	return stored.filter(
		(entry): entry is WithheldWrite =>
			Boolean(entry) &&
			typeof entry === "object" &&
			typeof (entry as WithheldWrite).toolName === "string",
	);
};

export const withheldWritesToolArgs = (
	withheld: ReadonlyArray<WithheldWrite>,
) => (withheld.length ? { [WITHHELD_WRITES_KEY]: withheld } : {});

const CHILD_SESSION_IDS_KEY = "_eveChildSessionIds";

export const childSessionIdsFromToolArgs = (
	toolArgs: unknown,
): ReadonlyArray<string> => {
	if (!toolArgs || typeof toolArgs !== "object") return [];
	const stored = (toolArgs as Record<string, unknown>)[CHILD_SESSION_IDS_KEY];
	if (!Array.isArray(stored)) return [];
	return stored.filter((id): id is string => typeof id === "string");
};

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
			withheld: siblings.map((request) => ({
				input: request.action.input,
				requestId: request.requestId,
				toolName: request.action.toolName,
			})),
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

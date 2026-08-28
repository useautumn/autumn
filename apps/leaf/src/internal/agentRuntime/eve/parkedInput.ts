import { WAITING_FOR_INPUT_MESSAGE } from "../../../ui/messages.js";
import type { EveInputRequest } from "./eveEventSchemas.js";
import { approvalOptionIds, textForInputRequests } from "./events.js";
import type { EvePendingRequest } from "./types.js";

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
	denyOptionId?: string;
	input?: Record<string, unknown>;
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

const isApprovalRequest = (request: EveInputRequest) =>
	request.kind === "tool-approval" || request.display === "confirmation";

const CHILD_SESSION_IDS_KEY = "_eveChildSessionIds";
const SIBLING_REQUEST_IDS_KEY = "_eveSiblingRequestIds";
export const WITHHELD_WRITES_KEY = "_eveWithheldWrites";

/** Leaf smuggles runtime facts to the approval card inside tool_args under
 * `_eve*` marker keys; every reader shares this one shape. */
const markerArrayFromToolArgs = <Entry>({
	isEntry,
	key,
	toolArgs,
}: {
	isEntry: (value: unknown) => value is Entry;
	key: string;
	toolArgs: unknown;
}): ReadonlyArray<Entry> => {
	if (!toolArgs || typeof toolArgs !== "object") return [];
	const stored = (toolArgs as Record<string, unknown>)[key];
	return Array.isArray(stored) ? stored.filter(isEntry) : [];
};

const isString = (value: unknown): value is string => typeof value === "string";

const isWithheldWrite = (value: unknown): value is WithheldWrite =>
	Boolean(value) &&
	typeof value === "object" &&
	typeof (value as WithheldWrite).toolName === "string";

export const withheldWritesFromToolArgs = (
	toolArgs: unknown,
): ReadonlyArray<WithheldWrite> =>
	markerArrayFromToolArgs({
		isEntry: isWithheldWrite,
		key: WITHHELD_WRITES_KEY,
		toolArgs,
	});

export const withheldWritesToolArgs = (
	withheld: ReadonlyArray<WithheldWrite>,
) => (withheld.length ? { [WITHHELD_WRITES_KEY]: withheld } : {});

export const childSessionIdsFromToolArgs = (
	toolArgs: unknown,
): ReadonlyArray<string> =>
	markerArrayFromToolArgs({
		isEntry: isString,
		key: CHILD_SESSION_IDS_KEY,
		toolArgs,
	});

export const childSessionIdsToolArgs = (
	childSessionIds: ReadonlyArray<string>,
) =>
	childSessionIds.length ? { [CHILD_SESSION_IDS_KEY]: childSessionIds } : {};

export const siblingRequestIdsFromToolArgs = (
	toolArgs: unknown,
): ReadonlyArray<string> =>
	markerArrayFromToolArgs({
		isEntry: isString,
		key: SIBLING_REQUEST_IDS_KEY,
		toolArgs,
	});

export const siblingRequestIdsToolArgs = (
	siblingRequestIds: ReadonlyArray<string>,
) =>
	siblingRequestIds.length
		? { [SIBLING_REQUEST_IDS_KEY]: siblingRequestIds }
		: {};

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

	const [gated, ...siblings] = pending.filter(isApprovalRequest);
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
				denyOptionId: approvalOptionIds(request.options).deny,
				input: request.action.input,
				requestId: request.requestId,
				toolName: request.action.toolName,
			})),
		};
	}

	const optioned = pending.find(
		(request) => request.kind === "question" || request.display === "select",
	);
	if (optioned) {
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

type GatedParkShape = {
	chained: {
		options?: ReadonlyArray<Readonly<{ id?: string }>>;
		requestId: string;
	};
	withheld: ReadonlyArray<{ denyOptionId?: string; requestId: string }>;
};

/** Every request in a gated batch with the option that releases it. */
export const pendingGatedRequests = (
	parked: GatedParkShape,
): EvePendingRequest[] =>
	[parked.chained, ...parked.withheld].map((request, index) => ({
		denyOptionId:
			index === 0
				? approvalOptionIds(parked.chained.options).deny
				: parked.withheld[index - 1]?.denyOptionId,
		kind: "gated" as const,
		requestId: request.requestId,
	}));

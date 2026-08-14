import type {
	ChainedPendingRequest,
	PendingQuestion,
} from "../../eve/parkedInput.js";

export type ResumedAgentTurn = Readonly<{
	chained?: ChainedPendingRequest;
	chainedSiblingRequestIds: ReadonlyArray<string>;
	deferredEmptyTurn: boolean;
	question?: PendingQuestion;
	text: string;
}>;

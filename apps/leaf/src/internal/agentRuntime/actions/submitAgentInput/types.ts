import type {
	ChainedPendingRequest,
	PendingQuestion,
} from "../../eve/parkedInput.js";

export type ResumedAgentTurn = Readonly<{
	chained?: ChainedPendingRequest;
	chainedSiblingRequestIds: ReadonlyArray<string>;
	approvedWriteFailed: boolean;
	writes: ReadonlyArray<{
		result?: unknown;
		status: "applied" | "failed" | "pending";
		toolName: string;
	}>;
	chainedWithheld?: ReadonlyArray<{
		input?: Record<string, unknown>;
		requestId: string;
		toolName: string;
	}>;
	approvedWriteUnverified: boolean;
	deferredEmptyTurn: boolean;
	question?: PendingQuestion;
	text: string;
}>;

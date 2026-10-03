import type {
	DeductionContext,
	DeductionRequest,
	WorkerFullSubject,
} from "@autumn/balance-engine";
import type { CheckReply } from "@autumn/balance-worker-client/protocol";

/** What a subject view decided for one selection within one second; replaced, never edited. */
export type SubjectDecision = {
	second: number;
	/** The selection's rows, bounded once: every request on this view and selection draws from it. */
	context: DeductionContext;
	/** Check replies by required balance. */
	checkReplies: Map<number, CheckReply>;
};

/** Decide once per (subject view, selection, second) and reuse it until the view is replaced by a write. */
export type SubjectDecisions = {
	readCheckReply(params: {
		fullSubject: WorkerFullSubject;
		request: DeductionRequest;
		answer: (params: { context: DeductionContext }) => CheckReply;
	}): CheckReply;
	readCounters(): SubjectDecisionCounters;
};

/** Since the partition started; partition health reports them. */
export type SubjectDecisionCounters = {
	checkMemoHits: number;
	checkMemoMisses: number;
	/** Checks with event properties: their rows can depend on them, so they are never reused. */
	checkMemoBypassed: number;
};

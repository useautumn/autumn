import type {
	Catalog,
	DeductionContext,
	DeductionRequest,
	MeteringIdentity,
	RowChange,
	SubjectState,
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

/** A run's deduction context, carried from state to state while every write only moves balances. */
export type TrackDecision = {
	context: DeductionContext;
	/** The view the context was set up on: a later state of the run differs from it only in balances. */
	fullSubject: WorkerFullSubject;
	catalog: Catalog;
	/** The clock range over which the selection finds the same rows. */
	validFrom: number;
	validUntil: number;
	alwaysDecidesEffects: boolean;
};

/** Decide once per (subject view, selection, second) and reuse it until the view is replaced by a write. */
export type SubjectDecisions = {
	/** The decision a track on `state` draws from: carried when the run holds one, set up on `join()` when not. */
	readTrackDecision(params: {
		state: SubjectState;
		identity: MeteringIdentity;
		request: DeductionRequest;
		catalog: Catalog;
		join: () => WorkerFullSubject;
	}): Pick<TrackDecision, "context" | "fullSubject" | "alwaysDecidesEffects">;
	/** Carries `from`'s track decisions to `to` by the changes the write applied; drops them when it cannot. */
	advance(params: {
		from: SubjectState | null;
		to: SubjectState;
		changes: RowChange[];
	}): void;
	countEffects(params: { decided: boolean }): void;
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
	trackContextHits: number;
	trackContextMisses: number;
	effectsRun: number;
	effectsSkipped: number;
};

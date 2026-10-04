import type {
	Catalog,
	CheckCommand,
	CheckResult,
	DeductionContext,
	DeductionDelta,
	DeductionRequest,
	MeteringIdentity,
	RowChange,
	SubjectState,
	TrackCommand,
	WorkerFullSubject,
} from "@autumn/balance-engine";
import type {
	CheckLease,
	CheckReply,
	TrackGrant,
} from "@autumn/balance-worker-client/protocol";

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
	/** Feeds the per-row draw rate a check lease's headroom is measured against. */
	recordDraws(params: { changes: RowChange[]; at: number }): void;
	/** The lease a server may answer this allowed check from, or null when a second of tracks could change it. */
	leaseCheck(params: {
		fullSubject: WorkerFullSubject;
		command: CheckCommand;
		context: DeductionContext;
		result: CheckResult;
	}): CheckLease | null;
	/** The context with every outstanding grant on the key reserved; a granted track first releases its own units. */
	reserveTrackGrants(params: {
		customerKey: string;
		command: TrackCommand;
		context: DeductionContext;
	}): DeductionContext;
	/** Units the lane may answer alone after this sync track, or null near the limit, for a guarded key, or a new owner. */
	grantTrack(params: {
		customerKey: string;
		command: TrackCommand;
		context: DeductionContext;
		deltas: DeductionDelta[];
		lane: string;
	}): TrackGrant | null;
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
	/** Check replies decided with a lease for the servers, or without one (refused, near the limit, guarded). */
	checkLeasesIssued: number;
	checkLeasesWithheld: number;
	/** Track grants given to a lane after its sync track, or withheld (near the limit, guarded, a new owner). */
	trackGrantsIssued: number;
	trackGrantsWithheld: number;
	/** Granted tracks applied against their grant, or after it lapsed or from a predecessor's. */
	trackGrantedApplied: number;
	trackGrantedLate: number;
};

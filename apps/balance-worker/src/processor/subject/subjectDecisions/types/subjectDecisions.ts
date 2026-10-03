import type {
	Catalog,
	DeductionContext,
	DeductionRequest,
	MeteringIdentity,
	RowChange,
	SubjectState,
	WorkerFullSubject,
} from "@autumn/balance-engine";

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
	readCounters(): SubjectDecisionCounters;
};

export type SubjectDecisionCounters = {
	trackContextHits: number;
	trackContextMisses: number;
	effectsRun: number;
	effectsSkipped: number;
};

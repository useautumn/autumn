export class ConflictingTrackReceiptError extends Error {
	constructor({ commandId }: { commandId: string }) {
		super(`Conflicting outcome for command ${commandId}`);
		this.name = "ConflictingTrackReceiptError";
	}
}

export class OutOfOrderTrackOutcomeError extends Error {
	constructor({
		stateRevision,
		outcomeRevision,
	}: {
		stateRevision: number;
		outcomeRevision: number;
	}) {
		super(
			`Cannot apply outcome at revision ${outcomeRevision} to state at revision ${stateRevision}`,
		);
		this.name = "OutOfOrderTrackOutcomeError";
	}
}

export class StaleTrackOutcomeError extends Error {
	constructor({ subject }: { subject: string }) {
		super(`Outcome does not match current state for ${subject}`);
		this.name = "StaleTrackOutcomeError";
	}
}

export class TrackOutcomeSubjectMismatchError extends Error {
	constructor() {
		super("Outcome subject does not match the current state owner");
		this.name = "TrackOutcomeSubjectMismatchError";
	}
}

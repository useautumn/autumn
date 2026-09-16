export class ReplayHydrationQueueSaturatedError extends Error {
	readonly code = "queue_saturated" as const;

	constructor() {
		super("Replay hydration queue is saturated");
		this.name = "ReplayHydrationQueueSaturatedError";
	}
}

export class ReplayHydrationDeadlineError extends Error {
	readonly code = "deadline" as const;

	constructor() {
		super("Replay hydration deadline exceeded");
		this.name = "ReplayHydrationDeadlineError";
	}
}

export class ReplayHydrationAbortedError extends Error {
	readonly code = "aborted" as const;

	constructor({ cause }: { cause?: unknown } = {}) {
		super("Replay hydration was aborted", { cause });
		this.name = "ReplayHydrationAbortedError";
	}
}

export class ReplayHydrationClosedError extends Error {
	readonly code = "closed" as const;

	constructor() {
		super("Replay hydration coordinator is closed");
		this.name = "ReplayHydrationClosedError";
	}
}

export class ReplayHydrationSelectionConflictError extends Error {
	readonly code = "selection_conflict" as const;

	constructor() {
		super("Customer hydration is already active with a different selection");
		this.name = "ReplayHydrationSelectionConflictError";
	}
}

export class ReplayHydrationInvalidSelectionError extends Error {
	readonly code = "invalid_selection" as const;

	constructor({ reason }: { reason: string }) {
		super(`Replay hydration selection is invalid: ${reason}`);
		this.name = "ReplayHydrationInvalidSelectionError";
	}
}

export class ReplayHydrationSourceRefusedError extends Error {
	readonly code = "source_refused" as const;
	readonly category: "missing" | "unsupported";
	readonly reason: string;

	constructor({
		category,
		reason,
	}: {
		category: "missing" | "unsupported";
		reason: string;
	}) {
		super(`Replay hydration source refused ${category}: ${reason}`);
		this.name = "ReplayHydrationSourceRefusedError";
		this.category = category;
		this.reason = reason;
	}
}

export class ReplayHydrationSourceMismatchError extends Error {
	readonly code = "source_mismatch" as const;

	constructor({ reason }: { reason: string }) {
		super(`Replay hydration source state does not match selection: ${reason}`);
		this.name = "ReplayHydrationSourceMismatchError";
	}
}

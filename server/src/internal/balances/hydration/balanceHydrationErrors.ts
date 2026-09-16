export class BalanceHydrationQueueSaturatedError extends Error {
	readonly code = "queue_saturated" as const;

	constructor() {
		super("Balance hydration queue is saturated");
		this.name = "BalanceHydrationQueueSaturatedError";
	}
}

export class BalanceHydrationDeadlineError extends Error {
	readonly code = "deadline" as const;

	constructor() {
		super("Balance hydration deadline exceeded");
		this.name = "BalanceHydrationDeadlineError";
	}
}

export class BalanceHydrationAbortedError extends Error {
	readonly code = "aborted" as const;

	constructor({ cause }: { cause?: unknown } = {}) {
		super("Balance hydration was aborted", { cause });
		this.name = "BalanceHydrationAbortedError";
	}
}

export class BalanceHydrationClosedError extends Error {
	readonly code = "closed" as const;

	constructor() {
		super("Balance hydration coordinator is closed");
		this.name = "BalanceHydrationClosedError";
	}
}

export class BalanceHydrationSelectionConflictError extends Error {
	readonly code = "selection_conflict" as const;

	constructor() {
		super("Customer hydration is already active with a different selection");
		this.name = "BalanceHydrationSelectionConflictError";
	}
}

export class BalanceHydrationInvalidSelectionError extends Error {
	readonly code = "invalid_selection" as const;

	constructor({ reason }: { reason: string }) {
		super(`Balance hydration selection is invalid: ${reason}`);
		this.name = "BalanceHydrationInvalidSelectionError";
	}
}

export class BalanceHydrationSourceRefusedError extends Error {
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
		super(`Balance hydration source refused ${category}: ${reason}`);
		this.name = "BalanceHydrationSourceRefusedError";
		this.category = category;
		this.reason = reason;
	}
}

export class BalanceHydrationSourceMismatchError extends Error {
	readonly code = "source_mismatch" as const;

	constructor({ reason }: { reason: string }) {
		super(`Balance hydration source state does not match selection: ${reason}`);
		this.name = "BalanceHydrationSourceMismatchError";
	}
}

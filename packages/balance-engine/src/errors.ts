export class StaleMutationError extends Error {
	constructor({ subject }: { subject: string }) {
		super(`Mutation does not match current state for ${subject}`);
		this.name = "StaleMutationError";
	}
}

export class OutOfOrderMutationError extends Error {
	constructor({
		stateRevision,
		mutationRevision,
	}: {
		stateRevision: number;
		mutationRevision: number;
	}) {
		super(
			`Cannot apply mutation at revision ${mutationRevision} to state at revision ${stateRevision}`,
		);
		this.name = "OutOfOrderMutationError";
	}
}

/** A non-initialize mutation arrived for a subject the worker holds no state for. */
export class SubjectStateMissingError extends Error {
	constructor() {
		super("Only an initialize can create subject state");
		this.name = "SubjectStateMissingError";
	}
}

export class MutationSubjectMismatchError extends Error {
	constructor() {
		super("Mutation subject does not match the current state owner");
		this.name = "MutationSubjectMismatchError";
	}
}

/** State references a catalog row the catalog does not hold; the caller filled the catalog incompletely. */
export class CatalogRowMissingError extends Error {
	constructor({ table, id }: { table: string; id: string }) {
		super(`Catalog row missing: ${table}:${id}`);
		this.name = "CatalogRowMissingError";
	}
}

export type UnsupportedCommandReason =
	| "balance_not_found"
	| "billing_plan_needs_postgres_store"
	| "billing_plan_rebalance_needs_catalog"
	| "billing_plan_row_owner_not_named"
	| "credit_rate_invalid"
	| "entity_not_found"
	| "feature_not_found"
	| "invoice_credit_not_mutable"
	| "lifetime_balance_has_no_reset"
	| "paid_allocated_not_supported"
	| "paid_balance_not_deletable"
	| "paid_recurring_balance_cannot_expire"
	| "pooled_balance_not_deletable"
	| "rate_card_on_unlimited_row"
	| "rate_card_with_additional_balance"
	| "subject_mismatch";

/** The engine cannot decide this command for this subject; the caller maps the reason to a status. */
export class UnsupportedCommandError extends Error {
	readonly reason: UnsupportedCommandReason;

	constructor({ reason }: { reason: UnsupportedCommandReason }) {
		super(`Unsupported command: ${reason}`);
		this.name = "UnsupportedCommandError";
		this.reason = reason;
	}
}

/** The customer already holds an open lock under this id; nothing was deducted. */
export class LockAlreadyExistsError extends Error {
	readonly lockId: string;

	constructor({ lockId }: { lockId: string }) {
		super(`Lock already exists: ${lockId}`);
		this.name = "LockAlreadyExistsError";
		this.lockId = lockId;
	}
}

/** No open lock under this id for the customer: never taken, already settled, or expired. */
export class LockNotFoundError extends Error {
	readonly lockId: string;

	constructor({ lockId }: { lockId: string }) {
		super(`Lock not found: ${lockId}`);
		this.name = "LockNotFoundError";
		this.lockId = lockId;
	}
}

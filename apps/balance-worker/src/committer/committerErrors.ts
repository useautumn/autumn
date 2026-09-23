import type { MeteringIdentity } from "@autumn/balance-engine";
import { SubjectStaleError } from "../processor/subject/subjectErrors.js";
export class UnsupportedRowChangeError extends Error {
	constructor({ table, op }: { table: string; op: string }) {
		super(`Row change not supported by the postgres backend: ${op} ${table}`);
		this.name = "UnsupportedRowChangeError";
	}
}

/** A guarded update matched no row: Postgres no longer holds the `before` the decision was made on. */
export class StaleSubjectRowsError extends Error {
	constructor({ ids }: { ids: string[] }) {
		super(`Subject rows moved underneath the worker: ${ids.join(", ")}`);
		this.name = "StaleSubjectRowsError";
	}
}

/** The committer stopped while this flush waited on the store: the log has the records, the next worker lands them. */
export class CommitterStoppedError extends Error {
	constructor({ cause }: { cause: unknown }) {
		super("Committer stopped while a flush was waiting on Postgres", { cause });
		this.name = "CommitterStoppedError";
	}
}

/** Behind a record that would not land: the log has it, Postgres will once recovery clears the way. */
export class FlushRecordBlockedError extends Error {
	constructor({
		mutationId,
		blockedBy,
	}: {
		mutationId: string;
		blockedBy: string;
	}) {
		super(`Log record ${mutationId} waits behind ${blockedBy}`);
		this.name = "FlushRecordBlockedError";
	}
}

/** A record that would not land on its own after retries: the log has it, Postgres does not. */
export class FlushRecordFailedError extends Error {
	constructor({ mutationId, cause }: { mutationId: string; cause: unknown }) {
		const reason = cause instanceof Error ? cause.message : String(cause);
		super(
			`Log record could not be committed to Postgres: ${mutationId} (${reason})`,
			{ cause },
		);
		this.name = "FlushRecordFailedError";
	}
}

/** Postgres refused this record for a reason no replay would change: it is skipped, and only its caller fails. */
export class FlushRecordRefusedError extends Error {
	constructor({ mutationId, cause }: { mutationId: string; cause: unknown }) {
		const reason = cause instanceof Error ? cause.message : String(cause);
		super(
			`Log record refused by Postgres and skipped: ${mutationId} (${reason})`,
			{
				cause,
			},
		);
		this.name = "FlushRecordRefusedError";
	}
}

/** A plan's row took a key Postgres already holds. The partition assigns its customers' ids, so a writer outside the worker did: a bug, not a race. */
export class BillingPlanRowCollisionError extends SubjectStaleError {
	constructor({
		identity,
		cause,
	}: {
		identity: MeteringIdentity;
		cause: unknown;
	}) {
		super({ identity, cause });
		this.name = "BillingPlanRowCollisionError";
		this.message = `A billing plan's row for customer ${identity.customerId} collided with one written outside the worker in ${identity.orgId}/${identity.env}`;
	}
}

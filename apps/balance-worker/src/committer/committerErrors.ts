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

/** Postgres will never take this record (a constraint or a value it cannot store): it is skipped, and only its caller fails. */
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

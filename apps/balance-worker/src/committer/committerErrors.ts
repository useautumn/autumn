import type { MeteringIdentity } from "@autumn/balance-engine";
import { SubjectStaleError } from "../processor/subject/subjectErrors.js";
import type { DurableMutationRecord } from "../state/types/durableMutation.js";
export class UnsupportedRowChangeError extends Error {
	constructor({ table, op }: { table: string; op: string }) {
		super(`Row change not supported by the postgres backend: ${op} ${table}`);
		this.name = "UnsupportedRowChangeError";
	}
}

export class StaleSubjectRowsError extends Error {
	readonly records: Set<DurableMutationRecord>;

	constructor({
		rows,
	}: {
		rows: { id: string; record: DurableMutationRecord }[];
	}) {
		super(
			`Subject rows moved underneath the worker: ${rows.map(({ id, record }) => `${id} (${record.mutation.id})`).join(", ")}`,
		);
		this.name = "StaleSubjectRowsError";
		this.records = new Set(rows.map(({ record }) => record));
	}
}

export class CommitterStoppedError extends Error {
	constructor({ cause }: { cause: unknown }) {
		super("Committer stopped while a flush was waiting on Postgres", { cause });
		this.name = "CommitterStoppedError";
	}
}

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

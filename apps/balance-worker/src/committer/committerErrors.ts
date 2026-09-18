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

export class PartitionProgressConflictError extends Error {
	constructor({
		topic,
		partition,
		expectedOffset,
	}: {
		topic: string;
		partition: number;
		expectedOffset: bigint;
	}) {
		super(
			`Partition progress for ${topic}[${partition}] is not at ${expectedOffset}`,
		);
		this.name = "PartitionProgressConflictError";
	}
}

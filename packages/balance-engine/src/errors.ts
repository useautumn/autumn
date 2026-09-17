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

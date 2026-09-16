export class PartitionWriterCapacityError extends Error {
	constructor() {
		super("Partition writer pending capacity reached");
		this.name = "PartitionWriterCapacityError";
	}
}

export class PartitionWriterStateNotFoundError extends Error {
	constructor({ customerKey }: { customerKey: string }) {
		super(`Partition writer state not found: ${customerKey}`);
		this.name = "PartitionWriterStateNotFoundError";
	}
}

/** The same commandId was reused for a different request. */
export class PartitionWriterCommandConflictError extends Error {
	constructor({ commandId }: { commandId: string }) {
		super(`Command id reused with different input: ${commandId}`);
		this.name = "PartitionWriterCommandConflictError";
	}
}

/** May be thrown only when the appender proves that nothing was committed. */
export class MutationBatchNotCommittedError extends Error {
	constructor({ cause }: { cause: unknown }) {
		super("Mutation batch was not committed", { cause });
		this.name = "MutationBatchNotCommittedError";
	}
}

export class MutationBatchAppendError extends Error {
	constructor({ cause }: { cause: unknown }) {
		super("Mutation batch was not durably appended", { cause });
		this.name = "MutationBatchAppendError";
	}
}

export class PartitionWriterRecoveryRequiredError extends Error {
	constructor({ cause }: { cause: unknown }) {
		super("Partition writer requires recovery", { cause });
		this.name = "PartitionWriterRecoveryRequiredError";
	}
}

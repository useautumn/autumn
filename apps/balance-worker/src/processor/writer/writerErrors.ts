export class PartitionWriterCapacityError extends Error {
	constructor() {
		super("Partition writer pending capacity reached");
		this.name = "PartitionWriterCapacityError";
	}
}

export class PartitionWriterRecordTooLargeError extends Error {
	constructor({
		bytes,
		maxBatchBytes,
	}: { bytes: number; maxBatchBytes: number }) {
		super(
			`Mutation record of ${bytes} bytes exceeds the ${maxBatchBytes} byte batch limit`,
		);
		this.name = "PartitionWriterRecordTooLargeError";
	}
}

export class PartitionWriterStateNotFoundError extends Error {
	constructor({ customerKey }: { customerKey: string }) {
		super(`Partition writer state not found: ${customerKey}`);
		this.name = "PartitionWriterStateNotFoundError";
	}
}

export class PartitionWriterDuplicateCommandError extends Error {
	constructor({ commandId }: { commandId: string }) {
		super(`Command already applied: ${commandId}`);
		this.name = "PartitionWriterDuplicateCommandError";
	}
}

export class PartitionWriterCommandConflictError extends Error {
	constructor({ commandId }: { commandId: string }) {
		super(`Command id reused with different input: ${commandId}`);
		this.name = "PartitionWriterCommandConflictError";
	}
}

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

export class PartitionWriterDisposedError extends Error {
	constructor() {
		super(
			"The partition's writer was disposed before the write's append was confirmed; its outcome is unknown",
		);
		this.name = "PartitionWriterDisposedError";
	}
}

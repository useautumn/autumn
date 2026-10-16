export class PartitionProcessorStateNotFoundError extends Error {
	constructor({ customerKey }: { customerKey: string }) {
		super(`Partition state not found: ${customerKey}`);
		this.name = "PartitionProcessorStateNotFoundError";
	}
}

/** The lock's feature is not among the subject's catalog rows; the record is redelivered, never settled another way. */
export class LockFeatureNotLoadedError extends Error {
	constructor({ lockId, featureId }: { lockId: string; featureId: string }) {
		super(
			`Lock ${lockId} names feature ${featureId}, which the subject's catalog does not hold`,
		);
		this.name = "LockFeatureNotLoadedError";
	}
}

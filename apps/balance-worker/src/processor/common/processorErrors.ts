/** The customer already has as many checks in flight as one customer may; this one was not run. */
export class CheckCapacityError extends Error {
	constructor({ customerKey }: { customerKey: string }) {
		super(`Too many checks in flight for ${customerKey}`);
		this.name = "CheckCapacityError";
	}
}

export class PartitionProcessorStateNotFoundError extends Error {
	constructor({ customerKey }: { customerKey: string }) {
		super(`Partition state not found: ${customerKey}`);
		this.name = "PartitionProcessorStateNotFoundError";
	}
}

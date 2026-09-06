export class PartitionProcessorStateNotFoundError extends Error {
	constructor({ customerKey }: { customerKey: string }) {
		super(`Partition state not found: ${customerKey}`);
		this.name = "PartitionProcessorStateNotFoundError";
	}
}

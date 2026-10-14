export class CommitPositionsOverlapError extends Error {
	constructor({ partition }: { partition: number }) {
		super(
			`Partition ${partition} already has a writer with unconfirmed writes; a second cannot issue sequence numbers`,
		);
		this.name = "CommitPositionsOverlapError";
	}
}

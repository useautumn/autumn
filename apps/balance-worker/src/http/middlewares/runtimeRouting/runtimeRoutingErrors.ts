export class PartitionRouteMismatchError extends Error {
	constructor() {
		super("Partition route does not match command identity");
		this.name = "PartitionRouteMismatchError";
	}
}

export class PartitionRouteNotOwnedError extends Error {
	constructor() {
		super("Partition route is not admitted by this worker");
		this.name = "PartitionRouteNotOwnedError";
	}
}

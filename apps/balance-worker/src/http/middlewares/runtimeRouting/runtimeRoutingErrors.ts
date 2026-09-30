import type { WorkerRouteSuccessor } from "@autumn/balance-worker-client/protocol";

export class PartitionRouteMismatchError extends Error {
	constructor() {
		super("Partition route does not match command identity");
		this.name = "PartitionRouteMismatchError";
	}
}

export class PartitionRouteNotOwnedError extends Error {
	/** Named once the handoff has claimed a route for the successor; absent while it is still unnamed or released. */
	readonly successor: WorkerRouteSuccessor | undefined;

	constructor({ successor }: { successor?: WorkerRouteSuccessor } = {}) {
		super("Partition route is not admitted by this worker");
		this.name = "PartitionRouteNotOwnedError";
		this.successor = successor;
	}
}

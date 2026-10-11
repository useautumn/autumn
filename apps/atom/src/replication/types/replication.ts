import type { ReplicatedOperation } from "./replicatedOperation.js";

/** Keeps every replica of this deployment holding what this one applied. */
export type Replication = {
	/** Passes an operation this replica applied on to every other replica, at least once, newest copy per key. */
	replicate(operation: ReplicatedOperation): void;
	/** The other replicas' addresses as the deployment's service name resolves them now. */
	peers(): Promise<string[]>;
	stop(): void;
};

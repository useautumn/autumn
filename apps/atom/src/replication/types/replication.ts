import type { ReplicatedOperation } from "./replicatedOperation.js";

export type Replication = {
	replicate(operation: ReplicatedOperation): void;
	peers(): Promise<string[]>;
	stop(): Promise<void>;
};

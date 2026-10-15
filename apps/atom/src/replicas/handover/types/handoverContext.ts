import type { AutumnLogger } from "@autumn/logging";
import type { ReplicaFolders } from "../../../replication/types/replicaFolders.js";
import type { Replication } from "../../../replication/types/replication.js";
import type { Membership } from "../../membership/types/membership.js";
import type { ReplicaRing } from "../../types/replicaRing.js";

/** What one thread needs to change who owns what: join a peer, or leave. */
export type HandoverContext = {
	ring: ReplicaRing;
	/** This replica's boot, named on every announcement. */
	boot: string;
	membership: Membership;
	/** The peers the service name lists, ready or not. */
	replication: Pick<Replication, "peers">;
	/** This thread's folders: whose journals it hands over. */
	folders: Pick<ReplicaFolders, "all">;
	/** This thread, and the replica's threads: the peers wait for every one of them to hand over. */
	thread: number;
	threads: number;
	/** The peers' public port, where /health says whether they serve, and from which boot. */
	publicPort: number;
	peer: { port: number; secret: string; fetch?: typeof fetch };
	logger: Pick<AutumnLogger, "info" | "warn">;
};

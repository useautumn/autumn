import type { AtomEnv } from "@autumn/env/atom";
import type { AutumnLogger } from "@autumn/logging";
import type { Auth } from "../../auth/types/auth.js";
import type { JournalForwarder } from "../../journalForwarder/types/journalForwarder.js";
import type { MultiTenantContext } from "../../multiTenant/multiTenantContext.js";
import type { Membership } from "../../replicas/membership/types/membership.js";
import type { ReplicaFolders } from "../../replication/types/replicaFolders.js";
import type { Replication } from "../../replication/types/replication.js";
import type { HeldSubjects } from "../../state/heldSubjects/types/heldSubjects.js";
import type { ThreadCounters } from "../../threads/stats/threadStats.js";
import type { ThreadHealthSource } from "../atomHealth.js";

/** Something the Atom starts and stops: a thread's server, or the main thread's set of them. */
export type AtomServer = {
	start(): Promise<void>;
	stop(): Promise<void>;
	/** One look at the listed peers before this thread answers, so a ready peer is counted from its first check on. */
	probePeers?(): Promise<void>;
};

export type AtomServerDependencies = {
	auth: Auth;
	multiTenant?: MultiTenantContext;
	logger: Pick<AutumnLogger, "info" | "warn" | "error">;
	health: ThreadHealthSource;
	counters: ThreadCounters;
	held: HeldSubjects;
	/** Every folder this thread holds, whose files it keeps within its share of the volume. */
	folders: Pick<ReplicaFolders, "all">;
	/** Keeps the other replicas holding what this thread applies. */
	replication: Replication;
	/** Hands Autumn what this thread's journals hold; drained before the files close. */
	journalForwarder: Pick<JournalForwarder, "drainAll">;
	/** Which listed peers count as ring members, over the table the replica's threads share. */
	membership: Membership;
};

export type AtomServerConfig = { env: AtomEnv; receivesPushes: boolean };

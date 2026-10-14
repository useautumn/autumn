import type { AtomEnv } from "@autumn/env/atom";
import type { AutumnLogger } from "@autumn/logging";
import type { Auth } from "../../auth/types/auth.js";
import type { MultiTenantContext } from "../../multiTenant/multiTenantContext.js";
import type { ReplicaFolders } from "../../replication/types/replicaFolders.js";
import type { Replication } from "../../replication/types/replication.js";
import type { HeldSubjects } from "../../state/heldSubjects/types/heldSubjects.js";
import type { ThreadCounters } from "../../threads/stats/threadStats.js";
import type { ThreadHealthSource } from "../atomHealth.js";

export type AtomServer = {
	start(): Promise<void>;
	stop(): Promise<void>;
};

export type AtomServerDependencies = {
	auth: Auth;
	multiTenant?: MultiTenantContext;
	logger: Pick<AutumnLogger, "info" | "warn" | "error">;
	health: ThreadHealthSource;
	counters: ThreadCounters;
	held: HeldSubjects;
	folders: Pick<ReplicaFolders, "all">;
	replication: Replication;
};

export type AtomServerConfig = { env: AtomEnv; receivesPushes: boolean };

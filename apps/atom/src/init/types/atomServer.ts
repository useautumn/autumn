import type { AtomEnv } from "@autumn/env/atom";
import type { AutumnLogger } from "@autumn/logging";
import type { Auth } from "../../auth/types/auth.js";
import type { MultiTenantContext } from "../../multiTenant/multiTenantContext.js";
import type { HeldSubjects } from "../../state/heldSubjects/types/heldSubjects.js";
import type { ThreadOwners } from "../../threads/owners/createSlotOwners.js";
import type { ThreadCounters } from "../../threads/stats/threadStats.js";
import type { AtomHealthSource } from "../atomHealth.js";

/** Something the Atom starts and stops: a thread's server, or the main thread's set of them. */
export type AtomServer = {
	start(): Promise<void>;
	stop(): Promise<void>;
};

export type AtomServerDependencies = {
	auth: Auth;
	multiTenant?: MultiTenantContext;
	logger: Pick<AutumnLogger, "info" | "warn" | "error">;
	health: AtomHealthSource;
	counters: ThreadCounters;
	held: HeldSubjects;
	owners: Pick<ThreadOwners, "callsWaiting">;
};

export type AtomServerConfig = { env: AtomEnv; receivesPushes: boolean };

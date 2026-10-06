import type { AtomEnv } from "@autumn/env/atom";
import type { AutumnLogger } from "@autumn/logging";
import type { Auth } from "../../auth/types/auth.js";
import type { MultiTenantContext } from "../../multiTenant/multiTenantContext.js";
import type { AtomHealthSource } from "../atomHealth.js";
import type { ProcessStatsRecorder } from "../processStats.js";

/** Something the Atom starts and stops: a thread's server, or the main thread's set of them. */
export type AtomServer = {
	start(): Promise<void>;
	stop(): Promise<void>;
};

export type AtomServerDependencies = {
	auth: Auth;
	multiTenant?: MultiTenantContext;
	logger: Pick<AutumnLogger, "info" | "warn" | "error">;
	processStats?: ProcessStatsRecorder;
	health: AtomHealthSource;
};

export type AtomServerConfig = { env: AtomEnv; receivesPushes: boolean };

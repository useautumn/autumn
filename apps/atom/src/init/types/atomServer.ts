import type { AtomEnv } from "@autumn/env/atom";
import type { AutumnLogger } from "@autumn/logging";
import type { ProcessStatsRecorder } from "../processStats.js";
import type { AtomProcessRole } from "./atomProcessRole.js";

/** The process: it opens the data directory and serves it. */
export type AtomServer = {
	start(): Promise<void>;
	stop(): Promise<void>;
};

export type AtomServerDependencies = {
	logger: Pick<AutumnLogger, "info" | "warn" | "error">;
	processStats?: ProcessStatsRecorder;
};

export type AtomServerConfig = { env: AtomEnv; role: AtomProcessRole };

import type { AutumnLogger } from "@autumn/logging";

/** One of the supervisor's processes: enough of a handle to wait on it and ask it to stop. */
export type AtomChild = {
	exited: Promise<unknown>;
	kill(signal: "SIGTERM"): void;
};

export type AtomSupervisorContext = {
	/** Starts the Atom server as its own process; `index` only tells them apart in logs. */
	spawnChild(params: { index: number }): AtomChild;
	logger: Pick<AutumnLogger, "info" | "warn" | "error">;
};

export type AtomSupervisorConfig = {
	processes: number;
	/** How long a child that died stays down, so one that cannot start does not spin. */
	restartDelayMs: number;
};

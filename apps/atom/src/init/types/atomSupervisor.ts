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
	/** Told each time a dead child is replaced, with the total since boot. */
	recordRestarts?(params: { restarts: number }): void;
};

export type AtomSupervisorConfig = {
	processes: number;
	/** How long a child that died stays down, so one that cannot start does not spin. */
	restartDelayMs: number;
};

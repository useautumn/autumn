import type { AutumnLogger } from "@autumn/logging";
import type { Herald } from "../../setup/createHerald.js";

/** Why herald is ending: the exit code follows from it. */
export type StopReason = "signal" | "consumer_crashed" | "start_failed";

export type HeraldLifecycleContext = {
	herald: Herald;
	logger: Pick<AutumnLogger, "info" | "error" | "flush">;
	/** Ends the process; injected so a test can watch the code instead of dying. */
	exit: (code: number) => void;
	/** The stop must finish inside this, or the backstop ends the process anyway. */
	stopBudgetMs: number;
};

export type HeraldLifecycleState = {
	stopping: Promise<void> | null;
};

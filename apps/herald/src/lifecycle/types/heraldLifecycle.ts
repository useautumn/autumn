import type { AutumnLogger } from "@autumn/logging";
import type { Herald } from "../../setup/createHerald.js";

export type StopReason = "signal" | "consumer_crashed" | "start_failed";

export type HeraldLifecycleContext = {
	herald: Herald;
	logger: Pick<AutumnLogger, "info" | "error" | "flush">;
	exit: (code: number) => void;
	stopBudgetMs: number;
};

export type HeraldLifecycleState = {
	stopping: Promise<void> | null;
};

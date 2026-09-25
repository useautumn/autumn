/** What an unset BALANCE_WORKER_ROLLOUT_ENABLED means on a local stack: the one line to flip for a local run. */
const LOCAL_DEFAULT = true;

/** Deployed images set NODE_ENV; the prod-secret scripts (bun p, w:prod, c:prod) run with development set but ENV_FILE=.env.prod. */
const runsAgainstProduction = ({
	runtimeEnv,
}: {
	runtimeEnv: Record<string, string | undefined>;
}): boolean =>
	runtimeEnv.NODE_ENV === "production" || runtimeEnv.ENV_FILE === ".env.prod";

/**
 * The env override: "true" forces the worker, "false" forces the legacy path, "config" defers to the rollout
 * config. Unset means the config against production and LOCAL_DEFAULT on a local stack.
 */
export function parseBalanceWorkerRolloutOverride({
	runtimeEnv,
}: {
	runtimeEnv: Record<string, string | undefined>;
}): boolean | undefined {
	const value = runtimeEnv.BALANCE_WORKER_ROLLOUT_ENABLED;
	if (value === "true") return true;
	if (value === "false") return false;
	if (value === "config") return undefined;
	return runsAgainstProduction({ runtimeEnv }) ? undefined : LOCAL_DEFAULT;
}

export function getBalanceWorkerRolloutOverride(): boolean | undefined {
	return parseBalanceWorkerRolloutOverride({ runtimeEnv: process.env });
}

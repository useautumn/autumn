/** What an unset BALANCE_WORKER_ROLLOUT_ENABLED means outside production: the one line to flip for a local run. */
// const LOCAL_DEFAULT = false;
const LOCAL_DEFAULT = true;

/**
 * The env override: "false" forces the legacy path, "true" forces the worker, "config" defers to the rollout
 * config. Unset means the config in production and LOCAL_DEFAULT everywhere else, so local stacks need no config.
 */
export function parseBalanceWorkerRolloutOverride({
	runtimeEnv,
}: {
	runtimeEnv: Record<string, string | undefined>;
}): boolean | undefined {
	const value = runtimeEnv.BALANCE_WORKER_ROLLOUT_ENABLED;
	if (value === "false") return false;
	if (value === "true") return true;
	if (value === "config") return undefined;
	return runtimeEnv.NODE_ENV === "production" ? undefined : LOCAL_DEFAULT;
}

export function getBalanceWorkerRolloutOverride(): boolean | undefined {
	return parseBalanceWorkerRolloutOverride({ runtimeEnv: process.env });
}

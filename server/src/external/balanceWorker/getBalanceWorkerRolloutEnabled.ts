import { isStagingEnv } from "@autumn/env";

const LOCAL_DEFAULT = true;

const runsAgainstProduction = ({
	runtimeEnv,
}: {
	runtimeEnv: Record<string, string | undefined>;
}): boolean =>
	(runtimeEnv.NODE_ENV === "production" ||
		runtimeEnv.ENV_FILE === ".env.prod") &&
	!isStagingEnv({ runtimeEnv });

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

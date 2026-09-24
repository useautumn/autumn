/** On everywhere for now; only the literal "false" keeps balances and billing plans on Postgres (tests of that path). */
export function parseBalanceWorkerRolloutEnabled({
	runtimeEnv,
}: {
	runtimeEnv: Record<string, string | undefined>;
}): boolean {
	return runtimeEnv.BALANCE_WORKER_ROLLOUT_ENABLED !== "false";
}

/** Whether this server routes balances and billing plans to the balance worker. */
export function getBalanceWorkerRolloutEnabled(): boolean {
	return parseBalanceWorkerRolloutEnabled({ runtimeEnv: process.env });
}

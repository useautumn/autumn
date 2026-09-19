// TEMP: every server routes sandbox traffic to the worker while it is being load tested.
const BALANCE_WORKER_ROLLOUT_ENABLED: boolean = true;

export function getBalanceWorkerRolloutEnabled(): boolean {
	return BALANCE_WORKER_ROLLOUT_ENABLED;
}

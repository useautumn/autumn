import { getBalanceWorkerRolloutEnabled } from "@autumn/env/balanceWorkerClient";

export function isBalanceWorkerRolloutEnabled(): boolean {
	return getBalanceWorkerRolloutEnabled();
}

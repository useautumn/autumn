import { getBalanceWorkerRolloutEnabled } from "@/external/balanceWorker/getBalanceWorkerRolloutEnabled.js";

export function isBalanceWorkerRolloutEnabled(): boolean {
	return getBalanceWorkerRolloutEnabled();
}

import {
	type BalanceWorkerClient,
	createBalanceWorkerClient,
} from "@autumn/balance-worker-client";
import {
	BALANCE_WORKER_PARTITION_COUNT,
	BALANCE_WORKER_REQUEST_TIMEOUT_MS,
} from "@autumn/env/balanceWorkerConstants";
import { getOwnershipConsumer } from "./getOwnershipConsumer.js";

let balanceWorkerClient: BalanceWorkerClient | undefined;

export function getBalanceWorkerClient(): BalanceWorkerClient {
	if (balanceWorkerClient) return balanceWorkerClient;
	balanceWorkerClient = createBalanceWorkerClient({
		ctx: { owners: getOwnershipConsumer() },
		config: {
			partitionCount: BALANCE_WORKER_PARTITION_COUNT,
			timeoutMs: BALANCE_WORKER_REQUEST_TIMEOUT_MS,
		},
	});
	return balanceWorkerClient;
}

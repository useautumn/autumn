import {
	type BalanceWorkerClient,
	createBalanceWorkerClient,
} from "@autumn/balance-worker-client";
import { getBalanceWorkerClientEnv } from "@autumn/env/balanceWorkerClient";
import { getOwnershipConsumer } from "./getOwnershipConsumer.js";

let balanceWorkerClient: BalanceWorkerClient | undefined;

export function getBalanceWorkerClient(): BalanceWorkerClient {
	if (balanceWorkerClient) return balanceWorkerClient;
	const env = getBalanceWorkerClientEnv();
	balanceWorkerClient = createBalanceWorkerClient({
		ctx: { owners: getOwnershipConsumer() },
		config: {
			partitionCount: env.BALANCE_WORKER_PARTITION_COUNT,
			timeoutMs: env.BALANCE_WORKER_REQUEST_TIMEOUT_MS,
		},
	});
	return balanceWorkerClient;
}

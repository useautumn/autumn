import {
	type BalanceWorkerClient,
	createBalanceWorkerClient,
	type PartitionOwner,
} from "@autumn/balance-worker-client";
import {
	BALANCE_WORKER_PARTITION_COUNT,
	BALANCE_WORKER_REQUEST_TIMEOUT_MS,
	BALANCE_WORKER_ROUTE_REFRESH_TIMEOUT_MS,
} from "@autumn/env/balanceWorkerConstants";
import { getOwnershipConsumer } from "./getOwnershipConsumer.js";

let balanceWorkerClient: BalanceWorkerClient | undefined;

/** Looks the consumer up on every call instead of capturing it. A consumer that
 *  fails its startup cannot be restarted, so it gets replaced rather than
 *  revived, and this client has to follow the replacement. */
/** Undefined until ownership has been read through at least once. Routing then
 *  resolves no owner and the caller gets a retryable answer, which is the truth:
 *  the server does not yet know who owns anything. */
function findOwner(params: { partition: number }): PartitionOwner | undefined {
	return getOwnershipConsumer()?.findOwner(params);
}

async function refresh(): Promise<void> {
	await getOwnershipConsumer()?.refresh();
}

export function getBalanceWorkerClient(): BalanceWorkerClient {
	if (balanceWorkerClient) return balanceWorkerClient;
	balanceWorkerClient = createBalanceWorkerClient({
		ctx: { owners: { findOwner, refresh } },
		config: {
			partitionCount: BALANCE_WORKER_PARTITION_COUNT,
			timeoutMs: BALANCE_WORKER_REQUEST_TIMEOUT_MS,
			// This client serves customer check and track calls, so a partition in
			// the middle of moving has to fail quickly rather than hold the request.
			routeRefreshTimeoutMs: BALANCE_WORKER_ROUTE_REFRESH_TIMEOUT_MS,
		},
	});
	return balanceWorkerClient;
}

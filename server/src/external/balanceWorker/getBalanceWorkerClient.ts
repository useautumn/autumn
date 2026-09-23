import {
	type BalanceWorkerClient,
	createKafkaBalanceWorkerClient,
	type KafkaBalanceWorkerClientConfig,
} from "@autumn/balance-worker-client";
import { getBalanceWorkerClientEnv } from "@autumn/env/balanceWorkerClient";
import {
	BALANCE_WORKER_OWNERSHIP_CATCH_UP_TIMEOUT_MS,
	BALANCE_WORKER_PARTITION_COUNT,
	BALANCE_WORKER_REQUEST_TIMEOUT_MS,
	BALANCE_WORKER_ROUTE_REFRESH_TIMEOUT_MS,
} from "@autumn/env/balanceWorkerConstants";
import { logger } from "@/external/logtail/logtailUtils.js";
import { readBalanceWorkerKafkaConfig } from "./balanceWorkerKafkaConfig.js";
import { getBalanceWorkerRolloutEnabled } from "./getBalanceWorkerRolloutEnabled.js";

let balanceWorkerClient: BalanceWorkerClient | undefined;

function balanceWorkerClientConfig(): KafkaBalanceWorkerClientConfig {
	const env = getBalanceWorkerClientEnv();
	return {
		kafka: readBalanceWorkerKafkaConfig({
			clientId: "autumn-server-balance-worker",
		}),
		ownershipTopic: env.BALANCE_WORKER_OWNERSHIP_TOPIC,
		commandTopic: env.BALANCE_WORKER_COMMAND_TOPIC,
		catalogInvalidationTopic: env.BALANCE_WORKER_CATALOG_INVALIDATION_TOPIC,
		groupIdPrefix: "autumn-server-ownership",
		partitionCount: BALANCE_WORKER_PARTITION_COUNT,
		timeoutMs: BALANCE_WORKER_REQUEST_TIMEOUT_MS,
		// This client serves customer check and track calls, so a partition in
		// the middle of moving has to fail quickly rather than hold the request.
		routeRefreshTimeoutMs: BALANCE_WORKER_ROUTE_REFRESH_TIMEOUT_MS,
		catchUpTimeoutMs: BALANCE_WORKER_OWNERSHIP_CATCH_UP_TIMEOUT_MS,
	};
}

/** Routing answers "no owner" until `startBalanceWorkerClient` has read the ownership log through. */
export function getBalanceWorkerClient(): BalanceWorkerClient {
	balanceWorkerClient ??= createKafkaBalanceWorkerClient({
		ctx: { logger },
		config: balanceWorkerClientConfig(),
	});
	return balanceWorkerClient;
}

/** Retries until the ownership log is read through; callers must not let it gate their listener. */
export async function startBalanceWorkerClient(): Promise<void> {
	if (!getBalanceWorkerRolloutEnabled()) {
		logger.info("[balance-worker] Client skipped: rollout disabled");
		return;
	}
	await getBalanceWorkerClient().start();
}

export async function stopBalanceWorkerClient(): Promise<void> {
	const running = balanceWorkerClient;
	balanceWorkerClient = undefined;
	await running?.stop();
}

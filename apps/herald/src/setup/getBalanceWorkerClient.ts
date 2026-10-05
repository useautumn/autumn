import {
	type BalanceWorkerClient,
	createKafkaBalanceWorkerClient,
} from "@autumn/balance-worker-client";
import { getBalanceWorkerClientEnv } from "@autumn/env/balanceWorkerClient";
import {
	BALANCE_WORKER_OWNERSHIP_CATCH_UP_TIMEOUT_MS,
	BALANCE_WORKER_REQUEST_TIMEOUT_MS,
} from "@autumn/env/balanceWorkerConstants";
import { getHeraldEnv } from "@autumn/env/herald";
import { getHeraldLogger } from "./getHeraldLogger.js";

let balanceWorkerClient: BalanceWorkerClient | undefined;

/** Reads subjects from their owners; routing answers "no owner" until `start` has read the ownership log through. */
export function getBalanceWorkerClient(): BalanceWorkerClient {
	const env = getBalanceWorkerClientEnv();
	balanceWorkerClient ??= createKafkaBalanceWorkerClient({
		ctx: { logger: getHeraldLogger() },
		config: {
			kafka: {
				clientId: "herald-balance-worker",
				brokers: env.KAFKA_BROKERS,
				authMode: env.KAFKA_AUTH_MODE,
				region: env.AWS_REGION,
				scram: getHeraldEnv().KAFKA_SCRAM,
			},
			ownershipTopic: env.BALANCE_WORKER_OWNERSHIP_TOPIC,
			commandTopic: env.BALANCE_WORKER_COMMAND_TOPIC,
			catalogInvalidationTopic: env.BALANCE_WORKER_CATALOG_INVALIDATION_TOPIC,
			groupIdPrefix: "herald-ownership",
			partitionCount: env.BALANCE_WORKER_PARTITION_COUNT,
			timeoutMs: BALANCE_WORKER_REQUEST_TIMEOUT_MS,
			catchUpTimeoutMs: BALANCE_WORKER_OWNERSHIP_CATCH_UP_TIMEOUT_MS,
			// Herald only reads subjects; it never queues or publishes.
			connectProducersOnStart: false,
		},
	});
	return balanceWorkerClient;
}

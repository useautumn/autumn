import {
	balanceWorkerDeploymentToKafkaNames,
	getBalanceWorkerDeployment,
} from "./balanceWorker/balanceWorkerDeployment.js";
import { brokerList } from "./balanceWorker/primitives.js";
import { createKafkaAuthEnv } from "./kafkaAuth.js";

const LOCAL_KAFKA_BROKERS = "127.0.0.1:19092";

export { balanceWorkerDeploymentToKafkaNames, getBalanceWorkerDeployment };

/** What a server reads to reach its workers: the Kafka cluster, the deployment's ownership topic, and the topic it queues commands on. */
export function createBalanceWorkerClientEnv(
	runtimeEnv: Record<string, string | undefined>,
) {
	if (!runtimeEnv.KAFKA_BROKERS && runtimeEnv.NODE_ENV === "production") {
		throw new Error("KAFKA_BROKERS is required in production");
	}
	const deployment = getBalanceWorkerDeployment({ runtimeEnv });
	return {
		...createKafkaAuthEnv({ runtimeEnv }),
		KAFKA_BROKERS: brokerList.parse(
			runtimeEnv.KAFKA_BROKERS ?? LOCAL_KAFKA_BROKERS,
		),
		BALANCE_WORKER_OWNERSHIP_TOPIC: balanceWorkerDeploymentToKafkaNames({
			deployment,
		}).ownershipTopic,
		BALANCE_WORKER_COMMAND_TOPIC: balanceWorkerDeploymentToKafkaNames({
			deployment,
		}).commandTopic,
		BALANCE_WORKER_CATALOG_INVALIDATION_TOPIC:
			balanceWorkerDeploymentToKafkaNames({ deployment })
				.catalogInvalidationTopic,
	};
}

type BalanceWorkerClientEnv = ReturnType<typeof createBalanceWorkerClientEnv>;
let balanceWorkerClientEnv: BalanceWorkerClientEnv | undefined;

export function getBalanceWorkerClientEnv(): BalanceWorkerClientEnv {
	balanceWorkerClientEnv ??= createBalanceWorkerClientEnv(process.env);
	return balanceWorkerClientEnv;
}

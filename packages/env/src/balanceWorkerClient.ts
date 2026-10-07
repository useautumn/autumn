import {
	balanceWorkerDeploymentToKafkaNames,
	getBalanceWorkerDeployment,
} from "./balanceWorker/balanceWorkerDeployment.js";
import { getBalanceWorkerPartitionCount } from "./balanceWorker/balanceWorkerPartitionCount.js";
import { brokerList } from "./balanceWorker/primitives.js";
import { createKafkaAuthEnv } from "./kafkaAuth.js";

const LOCAL_KAFKA_BROKERS = "127.0.0.1:19092";
const MIN_PROXY_SECRET_LENGTH = 32;

/** Direct wherever this process can reach Kafka: inside ECS, or a local plaintext cluster; MSK from anywhere else goes through the API. */
function readBalanceWorkerTransport({
	runtimeEnv,
}: {
	runtimeEnv: Record<string, string | undefined>;
}): "direct" | "proxy" {
	const override = runtimeEnv.BALANCE_WORKER_TRANSPORT;
	if (override === "direct" || override === "proxy") return override;
	if (override)
		throw new Error("BALANCE_WORKER_TRANSPORT must be direct or proxy");
	const onEcs = Boolean(runtimeEnv.ECS_CONTAINER_METADATA_URI_V4);
	const reachesKafka = onEcs || runtimeEnv.KAFKA_AUTH_MODE === "none";
	return reachesKafka ? "direct" : "proxy";
}

function readProxySecret({
	runtimeEnv,
}: {
	runtimeEnv: Record<string, string | undefined>;
}): string | null {
	const secret = runtimeEnv.BALANCE_WORKER_PROXY_SECRET?.trim() || null;
	if (secret && secret.length < MIN_PROXY_SECRET_LENGTH)
		throw new Error(
			`BALANCE_WORKER_PROXY_SECRET must be at least ${MIN_PROXY_SECRET_LENGTH} characters`,
		);
	return secret;
}

export {
	balanceWorkerDeploymentToKafkaNames,
	getBalanceWorkerDeployment,
	getBalanceWorkerPartitionCount,
};

/** What a server reads to reach its workers: the Kafka cluster, the deployment's ownership topic, and the topic it queues commands on. */
export function createBalanceWorkerClientEnv(
	runtimeEnv: Record<string, string | undefined>,
) {
	if (!runtimeEnv.KAFKA_BROKERS && runtimeEnv.NODE_ENV === "production") {
		throw new Error("KAFKA_BROKERS is required in production");
	}
	const deployment = getBalanceWorkerDeployment({ runtimeEnv });
	return {
		...createKafkaAuthEnv({ runtimeEnv, serviceUser: "SERVER" }),
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
		BALANCE_WORKER_PARTITION_COUNT: getBalanceWorkerPartitionCount({
			runtimeEnv,
		}),
	};
}

type BalanceWorkerClientEnv = ReturnType<typeof createBalanceWorkerClientEnv>;
let balanceWorkerClientEnv: BalanceWorkerClientEnv | undefined;

export function getBalanceWorkerClientEnv(): BalanceWorkerClientEnv {
	balanceWorkerClientEnv ??= createBalanceWorkerClientEnv(process.env);
	return balanceWorkerClientEnv;
}

/** How this process reaches its workers, read without the Kafka settings only direct mode needs. */
export function createBalanceWorkerTransportEnv(
	runtimeEnv: Record<string, string | undefined>,
) {
	return {
		BALANCE_WORKER_TRANSPORT: readBalanceWorkerTransport({ runtimeEnv }),
		/** Signs proxied calls outside the VPC and verifies them on the API; null leaves the proxy off. */
		BALANCE_WORKER_PROXY_SECRET: readProxySecret({ runtimeEnv }),
	};
}

type BalanceWorkerTransportEnv = ReturnType<
	typeof createBalanceWorkerTransportEnv
>;
let balanceWorkerTransportEnv: BalanceWorkerTransportEnv | undefined;

export function getBalanceWorkerTransportEnv(): BalanceWorkerTransportEnv {
	balanceWorkerTransportEnv ??= createBalanceWorkerTransportEnv(process.env);
	return balanceWorkerTransportEnv;
}

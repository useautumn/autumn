import type { BalanceWorkerKafkaConfig } from "@autumn/balance-worker-client";
import { getBalanceWorkerClientEnv } from "@autumn/env/balanceWorkerClient";

export function readBalanceWorkerKafkaConfig({
	clientId,
}: {
	clientId: string;
}): BalanceWorkerKafkaConfig {
	const env = getBalanceWorkerClientEnv();
	return {
		clientId,
		brokers: env.KAFKA_BROKERS,
		authMode: env.KAFKA_AUTH_MODE,
		region: env.AWS_REGION,
		sasl: env.KAFKA_SASL,
	};
}

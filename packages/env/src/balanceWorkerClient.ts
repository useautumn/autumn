import { createKafkaAuthEnv } from "./kafkaAuth.js";

export function createBalanceWorkerClientEnv(
	runtimeEnv: Record<string, string | undefined>,
) {
	const rollout = runtimeEnv.BALANCE_WORKER_ROLLOUT_ENABLED ?? "false";
	if (rollout !== "true" && rollout !== "false") {
		throw new Error("BALANCE_WORKER_ROLLOUT_ENABLED must be true or false");
	}
	if (rollout === "true" && runtimeEnv.NODE_ENV !== "development") {
		throw new Error(
			"Balance worker direct routing requires NODE_ENV=development",
		);
	}
	const brokers: string[] = [];
	for (const broker of (runtimeEnv.KAFKA_BROKERS ?? "127.0.0.1:19092").split(
		",",
	)) {
		brokers.push(broker.trim());
	}
	return {
		...createKafkaAuthEnv({ runtimeEnv }),
		BALANCE_WORKER_ROLLOUT_ENABLED: rollout === "true",
		KAFKA_BROKERS: brokers,
		BALANCE_WORKER_OWNERSHIP_TOPIC:
			runtimeEnv.BALANCE_WORKER_OWNERSHIP_TOPIC ?? "autumn-metering-ownership",
		BALANCE_WORKER_PARTITION_COUNT: Number(
			runtimeEnv.BALANCE_WORKER_PARTITION_COUNT ?? 8,
		),
		BALANCE_WORKER_REQUEST_TIMEOUT_MS: Number(
			runtimeEnv.BALANCE_WORKER_REQUEST_TIMEOUT_MS ?? 1_000,
		),
	};
}

type BalanceWorkerClientEnv = ReturnType<typeof createBalanceWorkerClientEnv>;
let balanceWorkerClientEnv: BalanceWorkerClientEnv | undefined;

export function getBalanceWorkerClientEnv(): BalanceWorkerClientEnv {
	balanceWorkerClientEnv ??= createBalanceWorkerClientEnv(process.env);
	return balanceWorkerClientEnv;
}

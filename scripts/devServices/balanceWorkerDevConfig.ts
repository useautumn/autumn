import { balanceWorkerPortFor } from "../dw/helpers/ports.ts";

export function balanceWorkerDevConfig({
	worktreeNum,
	runtimeEnv,
}: {
	worktreeNum: number;
	runtimeEnv: Record<string, string | undefined>;
}): Record<string, string> {
	const port =
		runtimeEnv.BALANCE_WORKER_PORT ?? String(balanceWorkerPortFor(worktreeNum));
	return {
		KAFKA_BROKERS: runtimeEnv.KAFKA_BROKERS ?? "127.0.0.1:19092",
		KAFKAJS_LOG_LEVEL: runtimeEnv.KAFKAJS_LOG_LEVEL ?? "error",
		BALANCE_WORKER_PORT: port,
		BALANCE_WORKER_HOST: "127.0.0.1",
		BALANCE_WORKER_ENDPOINT: `http://127.0.0.1:${port}`,
		BALANCE_WORKER_METERING_TOPIC:
			runtimeEnv.BALANCE_WORKER_METERING_TOPIC ?? "autumn-metering",
		BALANCE_WORKER_OWNERSHIP_TOPIC:
			runtimeEnv.BALANCE_WORKER_OWNERSHIP_TOPIC ?? "autumn-metering-ownership",
		BALANCE_WORKER_PARTITION_COUNT:
			runtimeEnv.BALANCE_WORKER_PARTITION_COUNT ?? "8",
	};
}

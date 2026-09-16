import type { OwnedPartitionHealth } from "../../../src/health/ownedPartitionHealth.js";
import type { BalanceWorkerState } from "../../../src/init/types/balanceWorkerState.js";
import { createWorkerHealthReporter } from "../../../src/logging/createWorkerHealthReporter.js";

export function createHealthReporterFixture() {
	const logs: unknown[][] = [];
	const warnings: unknown[][] = [];
	const timers: { intervalMs: number; run(): void; cancelled: boolean }[] = [];
	const health = {
		partitions: [] as OwnedPartitionHealth[],
		status: "starting" as BalanceWorkerState["status"],
		readFailure: false,
		logFailure: false,
		reads: 0,
	};
	const reporter = createWorkerHealthReporter({
		ctx: {
			logger: {
				info: (...args) => {
					if (health.logFailure) throw new Error("log unavailable");
					logs.push(args);
				},
				warn: (...args) => {
					if (health.logFailure) throw new Error("log unavailable");
					warnings.push(args);
				},
			},
			readPartitions: () => {
				health.reads++;
				if (health.readFailure) throw new Error("SQLite unavailable");
				return health.partitions;
			},
			readWorkerStatus: () => health.status,
			schedule: ({ intervalMs, run }) => {
				const timer = { intervalMs, run, cancelled: false };
				timers.push(timer);
				return () => {
					timer.cancelled = true;
				};
			},
		},
		config: {
			deployment: "tf-balance-staging-v1",
			endpoint: "http://10.0.0.1:8082",
		},
	});
	return { reporter, logs, warnings, timers, health };
}

export function partitionHealth(
	values: Partial<OwnedPartitionHealth> = {},
): OwnedPartitionHealth {
	return {
		topic: "tf-balance-staging-v1-events",
		partition: 0,
		status: "ready",
		localNextOffset: 41n,
		consumedNextOffset: 42n,
		highWatermark: 42n,
		lag: 0n,
		failureReason: null,
		...values,
	};
}

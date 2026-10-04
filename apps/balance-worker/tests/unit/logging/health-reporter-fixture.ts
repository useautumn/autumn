import type { OwnedPartitionHealth } from "../../../src/health/ownedPartitionHealth.js";
import type { BalanceWorkerState } from "../../../src/init/types/balanceWorkerState.js";
import { createWorkerHealthReporter } from "../../../src/logging/createWorkerHealthReporter.js";
import type { CheckAdmissionInterval } from "../../../src/runtime/deadlineShed/checkAdmission.js";

export function createHealthReporterFixture({
	enabled = true,
}: {
	enabled?: boolean;
} = {}) {
	const logs: unknown[][] = [];
	const warnings: unknown[][] = [];
	const timers: { intervalMs: number; run(): void; cancelled: boolean }[] = [];
	const health = {
		partitions: [] as OwnedPartitionHealth[],
		status: "starting" as BalanceWorkerState["status"],
		consumer: { status: "joined", rejoinAttempts: 0 } as {
			status: "joined" | "rejoining";
			rejoinAttempts: number;
		},
		checkAdmission: null as CheckAdmissionInterval | null,
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
			readConsumer: () => health.consumer,
			readCheckAdmission: () => health.checkAdmission,
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
			enabled,
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

import { expect, test } from "bun:test";
import {
	createHealthReporterFixture,
	partitionHealth,
} from "./health-reporter-fixture.js";

test.concurrent(
	"reports startup with no partitions, then current health every ten seconds",
	() => {
		const { reporter, health, logs, timers } = createHealthReporterFixture();
		try {
			reporter.start();
			reporter.start();
			expect(timers).toHaveLength(1);
			expect(timers[0].intervalMs).toBe(10_000);
			expect(logs).toHaveLength(1);
			expect(logs[0][0]).toMatchObject({
				event: "balance_worker.health",
				workerDeployment: "tf-balance-staging-v1",
				workerEndpoint: "http://10.0.0.1:8082",
				workerInstanceId: expect.any(String),
				workerStatus: "starting",
				reportedPartitions: 0,
				partitionStatusCounts: {},
			});
			health.status = "running";
			health.partitions = [partitionHealth()];
			timers[0].run();
			expect(logs).toHaveLength(3);
			expect(logs[1][0]).toMatchObject({
				workerStatus: "running",
				reportedPartitions: 1,
				partitionStatusCounts: { ready: 1 },
			});
			expect(logs[2][0]).toMatchObject({
				event: "balance_worker.partition_health",
				topic: "tf-balance-staging-v1-events",
				partition: 0,
				status: "ready",
				localNextOffset: "41",
				consumedNextOffset: "42",
				highWatermark: "42",
				lag: "0",
			});
		} finally {
			reporter.stop();
		}
	},
);

test.concurrent(
	"keeps offsets lossless and nulls unknown without changing partition state",
	() => {
		const { reporter, health, logs, timers } = createHealthReporterFixture();
		const original = partitionHealth({
			localNextOffset: 9007199254740993n,
			consumedNextOffset: null,
			highWatermark: null,
			lag: null,
		});
		const withPrivateData = { ...original, customerState: "do-not-log" };
		Object.freeze(withPrivateData);
		Object.freeze(original);
		try {
			health.partitions = [withPrivateData];
			reporter.start();
			expect(logs[1]?.[0]).toMatchObject({
				localNextOffset: "9007199254740993",
				consumedNextOffset: null,
				highWatermark: null,
				lag: null,
			});
			expect(JSON.stringify(logs)).not.toContain("do-not-log");
			health.partitions = [
				partitionHealth({
					status: "recovery_required",
					failureReason: "checkpoint_ahead_of_log_end",
				}),
			];
			timers[0].run();
			expect(logs[3][0]).toMatchObject({
				status: "recovery_required",
				failureReason: "checkpoint_ahead_of_log_end",
			});
			expect(withPrivateData.localNextOffset).toBe(9007199254740993n);
		} finally {
			reporter.stop();
		}
	},
);

test.concurrent(
	"degraded checkpoints and cleanup do not imply an unready partition",
	() => {
		const { reporter, health, logs } = createHealthReporterFixture();
		health.partitions = [
			partitionHealth({
				checkpoint: {
					status: "degraded",
					lastConfirmedNextOffset: 9007199254740993n,
					lastPublishedAt: 1000,
					lastAttemptAt: 2000,
					lastDurationMs: 123,
					lastSerializedBytes: 5000,
					dirtySince: 1500,
					uncheckpointedAgeMs: 500,
					failure: {
						name: "PartitionCheckpointLimitExceededError",
						message: "Checkpoint too large",
						retriable: false,
						limitName: "maxStates",
						limit: 10000,
						observed: 10001,
					},
					cleanup: {
						status: "degraded",
						lastAttemptAt: 2000,
						nextAttemptAt: 6000,
						lastPrunedAt: 1000,
						deletedReceipts: 12,
						lastDurationMs: 2,
						backlog: "possible",
						failure: { name: "BusyError", message: "Busy", retriable: true },
					},
				},
			}),
		];
		try {
			reporter.start();
			expect(logs[1]?.[0]).toMatchObject({
				status: "ready",
				checkpoint: {
					status: "degraded",
					lastConfirmedNextOffset: "9007199254740993",
					lastDurationMs: 123,
					uncheckpointedAgeMs: 500,
					failure: { limitName: "maxStates", limit: 10000, observed: 10001 },
					cleanup: {
						status: "degraded",
						backlog: "possible",
						deletedReceipts: 12,
					},
				},
			});
			expect(() => JSON.stringify(logs)).not.toThrow();
		} finally {
			reporter.stop();
		}
	},
);

import { expect, test } from "bun:test";
import { createBalanceWorkerEnv } from "@autumn/env/balanceWorker";
import { createWorkerCheckpointResources } from "../../../../src/init/construction/createWorkerCheckpointResources.js";
import type { WorkerCheckpointFactories } from "../../../../src/init/types/workerCheckpointResources.js";
import {
	createWorkerCheckpointConfig,
	workerCheckpointLimits,
} from "../../../../src/init/workerCheckpointConfig.js";
import type { S3CheckpointThreadConfig } from "../../../../src/s3/background/s3CheckpointThreadConfig.js";
import { createSchedulerFixture } from "../../checkpoint/scheduling/scheduler-fixtures.js";

test.concurrent.each(["off", "restore_only", "enabled"])(
	"%s composes only its S3 resources but always prunes ready partitions",
	async (mode) => {
		const fixture = createSchedulerFixture();
		fixture.initialize({ partition: 0 });
		const created: string[] = [];
		const inputs: S3CheckpointThreadConfig[] = [];
		const factories: WorkerCheckpointFactories = {
			createSource: (config) => {
				created.push("source");
				inputs.push(config);
				return {
					source: {
						latest: async () => {
							created.push("get");
							return null;
						},
					},
					close: () => {
						created.push("source-close");
					},
				};
			},
			createExporter: (config) => {
				created.push("thread");
				inputs.push(config);
				return {
					export: fixture.exporter.export,
					close: async () => {
						created.push("thread-close");
					},
				};
			},
		};
		const config = createWorkerCheckpointConfig({
			env: createBalanceWorkerEnv({
				KAFKA_BROKERS: "localhost:19092",
				BALANCE_WORKER_CHECKPOINT_MODE: mode,
				BALANCE_WORKER_CHECKPOINT_BUCKET: "test-checkpoints",
				BALANCE_WORKER_CHECKPOINT_REGION: "us-east-1",
				BALANCE_WORKER_CHECKPOINT_ENDPOINT: "http://localhost:19000",
				BALANCE_WORKER_CHECKPOINT_FORCE_PATH_STYLE: "true",
			}),
		});
		const resources = await createWorkerCheckpointResources({
			ctx: { stateStore: fixture.store, factories, clock: fixture.clock },
			config,
		});
		try {
			expect(created).toEqual(
				mode === "off"
					? []
					: mode === "enabled"
						? ["source", "thread"]
						: ["source"],
			);
			for (const input of inputs) {
				expect(input).toMatchObject({
					databasePath: ".data/balance-worker.sqlite",
					client: { endpoint: "http://localhost:19000", forcePathStyle: true },
				});
				expect(input.checkpointLimits).toBe(workerCheckpointLimits);
			}
			if (inputs.length === 2) expect(inputs[0]).toBe(inputs[1]);
			await fixture.clock.advance(1000);
			const controller = new AbortController();
			const lease = resources.maintenance.start({
				topic: fixture.topic,
				partition: 0,
				signal: controller.signal,
				readConsumedNextOffset: () => null,
				onStateFailure: ({ cause }) => {
					throw cause;
				},
			});
			expect(lease.getHealth().cleanup.lastPrunedAt).toBeNull();
			await fixture.clock.advance(1000);
			expect(lease.getHealth().cleanup).toMatchObject({
				status: "healthy",
				backlog: "clear",
				failure: null,
			});
			if (mode !== "enabled")
				expect(lease.getHealth()).toMatchObject({
					status: "disabled",
					dirtySince: null,
				});
			controller.abort();
			const prunedAt = lease.getHealth().cleanup.lastPrunedAt;
			await fixture.clock.advance(1000);
			expect(lease.getHealth().cleanup.lastPrunedAt).toBe(prunedAt);
		} finally {
			await resources.stop();
			await fixture.close();
		}
	},
);

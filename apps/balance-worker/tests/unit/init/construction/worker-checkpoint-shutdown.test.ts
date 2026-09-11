import { expect, test } from "bun:test";
import { createBalanceWorkerEnv } from "@autumn/env/balanceWorker";
import { createWorkerCheckpointResources } from "../../../../src/init/construction/createWorkerCheckpointResources.js";
import { createWorkerCheckpointConfig } from "../../../../src/init/workerCheckpointConfig.js";
import { createSchedulerFixture } from "../../checkpoint/scheduling/scheduler-fixtures.js";

const enabledConfig = () =>
	createWorkerCheckpointConfig({
		env: createBalanceWorkerEnv({
			KAFKA_AUTH_MODE: "none",
			KAFKA_BROKERS: "localhost:19092",
			BALANCE_WORKER_CHECKPOINT_MODE: "enabled",
			BALANCE_WORKER_CHECKPOINT_BUCKET: "test-checkpoints",
			BALANCE_WORKER_CHECKPOINT_REGION: "us-east-1",
			BALANCE_WORKER_CHECKPOINT_INTERVAL_MS: "100",
		}),
	});

test.concurrent(
	"shutdown aborts export, waits for thread and cleanup continuations, and closes the source last",
	async () => {
		const fixture = createSchedulerFixture();
		const exported = Promise.withResolvers<void>();
		const closed = Promise.withResolvers<void>();
		const yielded = Promise.withResolvers<void>();
		const events: string[] = [];
		let signal: AbortSignal | undefined;
		const config = enabledConfig();
		config.scheduler.cleanupIntervalMs = 100;
		fixture.clock.yield = () => yielded.promise;
		const resources = await createWorkerCheckpointResources({
			ctx: {
				stateStore: fixture.store,
				clock: fixture.clock,
				factories: {
					createSource: () => ({
						source: { latest: async () => null },
						close: () => {
							events.push("source-closed");
						},
					}),
					createExporter: () => ({
						export: async (params) => {
							signal = params.signal;
							await exported.promise;
							return fixture.exporter.export(params);
						},
						close: async () => {
							events.push("thread-stop");
							await closed.promise;
							events.push("thread-stopped");
						},
					}),
				},
			},
			config,
		});
		try {
			fixture.initialize({ partition: 0 });
			resources.maintenance.start({
				topic: fixture.topic,
				partition: 0,
				signal: new AbortController().signal,
				readConsumedNextOffset: () => null,
				onStateFailure: ({ cause }) => {
					throw cause;
				},
			});
			await fixture.clock.advance(100);
			expect(signal?.aborted).toBe(false);
			let settled = false;
			const stopping = resources.stop();
			expect(resources.stop()).toBe(stopping);
			const completion = stopping.then(() => {
				settled = true;
			});
			expect(signal?.aborted).toBe(true);
			exported.resolve();
			closed.resolve();
			await fixture.clock.settle();
			expect(settled).toBe(false);
			expect(events).not.toContain("source-closed");
			yielded.resolve();
			await completion;
			expect(events).toEqual([
				"thread-stop",
				"thread-stopped",
				"source-closed",
			]);
			expect(fixture.clock.pendingTimers).toBe(0);
		} finally {
			exported.resolve();
			closed.resolve();
			yielded.resolve();
			await resources.stop();
			await fixture.close();
		}
	},
);

test.concurrent(
	"partial construction disposes the source if the exporter factory fails",
	async () => {
		const fixture = createSchedulerFixture();
		const cause = new Error("thread config rejected");
		const events: string[] = [];
		try {
			await expect(
				createWorkerCheckpointResources({
					ctx: {
						stateStore: fixture.store,
						factories: {
							createSource: () => ({
								source: { latest: async () => null },
								close: () => {
									events.push("source-closed");
								},
							}),
							createExporter: () => {
								throw cause;
							},
						},
					},
					config: enabledConfig(),
				}),
			).rejects.toBe(cause);
			expect(events).toEqual(["source-closed"]);
		} finally {
			await fixture.close();
		}
	},
);

test.concurrent(
	"failed thread termination rejects repeated shutdown and never pretends quiescence",
	async () => {
		const fixture = createSchedulerFixture();
		const cause = new Error("thread termination failed");
		const resources = await createWorkerCheckpointResources({
			ctx: {
				stateStore: fixture.store,
				factories: {
					createSource: () => ({
						source: { latest: async () => null },
						close: () => {},
					}),
					createExporter: () => ({
						export: fixture.exporter.export,
						close: async () => {
							throw cause;
						},
					}),
				},
			},
			config: enabledConfig(),
		});
		try {
			const stopped = resources.stop();
			await expect(stopped).rejects.toMatchObject({ errors: [cause] });
			expect(resources.stop()).toBe(stopped);
		} finally {
			await fixture.close();
		}
	},
);

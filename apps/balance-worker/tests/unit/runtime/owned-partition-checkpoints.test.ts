import { describe, expect, test } from "bun:test";
import { parseCheckCommand, parseTrackCommand } from "@autumn/balance-engine";
import { PartitionCheckpointPublisherError } from "../../../src/checkpoint/partitionCheckpointPublisher.js";
import { createPartitionRuntime } from "../../../src/runtime/createPartitionRuntime.js";
import type { PartitionOutcomeFollowerPort } from "../../../src/runtime/types/partitionRuntime.js";
import { createSchedulerFixture } from "../checkpoint/scheduling/scheduler-fixtures.js";

const createRuntime = ({
	fixture,
	catchUp = Promise.resolve(),
}: {
	fixture: ReturnType<typeof createSchedulerFixture>;
	catchUp?: Promise<void>;
}) => {
	const state = fixture.initialize({ partition: 0 });
	let unavailable:
		| Parameters<
				PartitionOutcomeFollowerPort["startAndCatchUp"]
		  >[0]["onUnavailable"]
		| null = null;
	const follower: PartitionOutcomeFollowerPort = {
		readLogRange: async () => ({ logStartOffset: 0n, logEndOffset: 2n }),
		startAndCatchUp: async ({ onUnavailable }) => {
			unavailable = onUnavailable;
			await catchUp;
		},
		readProgress: () => ({ consumedNextOffset: 2n, highWatermark: 100n }),
		stop: async () => {},
	};
	const runtime = createPartitionRuntime({
		ctx: {
			stateStore: fixture.store,
			producer: {
				connect: async () => {},
				fence: async () => {},
				disconnect: async () => {},
			},
			appender: { appendCommitted: async () => ({ baseOffset: 2n }) },
			follower,
			bootstrapper: {
				bootstrap: async () => ({ kind: "continued", nextOffset: 1n }),
			},
			partitionResolver: { partitionForIdentity: () => 0 },
			trackReceiptPolicy: { now: fixture.clock.now, retentionMs: 60_000 },
			checkpointMaintenance: fixture.scheduler,
		},
		config: {
			topic: fixture.topic,
			partition: 0,
			writerLimits: {
				maxBatchSize: 10,
				maxPendingCommands: 100,
				maxPendingCommandsPerCustomer: 100,
			},
			recoveryDrainTimeoutMs: 100,
		},
	});
	return {
		runtime,
		identity: state.identity,
		preparationFollower: { ...follower },
		loseFollower: () => unavailable?.({ cause: new Error("follower lost") }),
	};
};

describe("owned partition checkpoints", () => {
	test.concurrent(
		"does not register during preparation and starts only on activation",
		async () => {
			const fixture = createSchedulerFixture();
			const { runtime, preparationFollower } = createRuntime({ fixture });
			try {
				await runtime.prepare({ follower: preparationFollower });
				expect(runtime.getStatus()).toBe("prepared");
				await fixture.clock.advance(500);
				expect(fixture.clock.pendingTimers).toBe(0);
				expect(runtime.getHealth()).not.toHaveProperty("checkpoint");
				await runtime.activate();
				await fixture.clock.advance(100);
				expect(runtime.getHealth()).toMatchObject({
					status: "ready",
					checkpoint: { lastConfirmedNextOffset: 2n },
				});
			} finally {
				await runtime.stop();
				fixture.close();
			}
		},
	);

	test.concurrent(
		"aborts an in-flight export immediately on drain",
		async () => {
			const publication = Promise.withResolvers<{
				kind: "published";
				etag: string;
			}>();
			let uploadSignal: AbortSignal | undefined;
			const fixture = createSchedulerFixture({
				publish: ({ signal }) => {
					uploadSignal = signal;
					return publication.promise;
				},
			});
			const { runtime } = createRuntime({ fixture });
			try {
				await runtime.start();
				await fixture.clock.advance(100);
				expect(uploadSignal?.aborted).toBe(false);
				const draining = runtime.drain();
				expect(uploadSignal?.aborted).toBe(true);
				publication.resolve({ kind: "published", etag: "late" });
				await draining;
				await fixture.clock.settle();
				expect(runtime.getHealth()).toMatchObject({
					status: "draining",
					checkpoint: { status: "stopped", lastConfirmedNextOffset: null },
				});
				expect(fixture.clock.pendingTimers).toBe(0);
			} finally {
				publication.resolve({ kind: "published", etag: "late" });
				await runtime.stop();
				fixture.close();
			}
		},
	);

	test.concurrent(
		"never registers if revoked while catch-up is pending",
		async () => {
			const gate = Promise.withResolvers<void>();
			const fixture = createSchedulerFixture();
			const { runtime } = createRuntime({ fixture, catchUp: gate.promise });
			try {
				const starting = runtime.start().catch((cause: unknown) => cause);
				await fixture.clock.settle();
				const stopping = runtime.stop();
				gate.resolve();
				expect(await starting).toBeInstanceOf(Error);
				await stopping;
				expect(runtime.getHealth()).not.toHaveProperty("checkpoint");
				expect(fixture.clock.pendingTimers).toBe(0);
			} finally {
				gate.resolve();
				await runtime.stop();
				fixture.close();
			}
		},
	);

	test("starts only after catch-up and cancels without a final export on stop", async () => {
		const offsets: bigint[] = [];
		const gate = Promise.withResolvers<void>();
		const fixture = createSchedulerFixture({
			publish: async ({ checkpoint }) => {
				offsets.push(checkpoint.nextOffset);
				return { kind: "published", etag: "etag" };
			},
		});
		const { runtime } = createRuntime({ fixture, catchUp: gate.promise });
		try {
			const starting = runtime.start();
			await fixture.clock.settle();
			await fixture.clock.advance(500);
			expect(offsets).toEqual([]);
			gate.resolve();
			await starting;
			await fixture.clock.advance(100);
			expect(offsets).toEqual([2n]);
			expect(runtime.getHealth()).toMatchObject({
				status: "ready",
				checkpoint: { lastConfirmedNextOffset: 2n },
			});
			await runtime.stop();
			await fixture.clock.advance(500);
			expect(offsets).toEqual([2n]);
			expect(fixture.clock.pendingTimers).toBe(0);
		} finally {
			gate.resolve();
			await runtime.stop();
			fixture.close();
		}
	});

	test("cancels maintenance immediately when the follower is lost", async () => {
		const fixture = createSchedulerFixture();
		const { runtime, loseFollower } = createRuntime({ fixture });
		try {
			await runtime.start();
			expect(fixture.clock.pendingTimers).toBeGreaterThan(0);
			loseFollower();
			expect(runtime.getStatus()).toBe("recovery_required");
			expect(fixture.clock.pendingTimers).toBe(0);
		} finally {
			await runtime.stop();
			fixture.close();
		}
	});

	test.concurrent(
		"routes local capture corruption through runtime recovery",
		async () => {
			const fixture = createSchedulerFixture();
			const { runtime } = createRuntime({ fixture });
			const corruptState = new Error("invalid local state");
			fixture.store.capturePartitionCheckpoint = () => {
				throw corruptState;
			};
			try {
				await runtime.start();
				await fixture.clock.advance(100);
				expect(runtime.getHealth()).toMatchObject({
					status: "recovery_required",
					checkpoint: {
						status: "stopped",
						failure: { message: "invalid local state" },
					},
				});
				expect(fixture.clock.pendingTimers).toBe(0);
			} finally {
				await runtime.stop();
				fixture.close();
			}
		},
	);

	test("keeps checks and tracks available while S3 is unavailable", async () => {
		const fixture = createSchedulerFixture({
			publish: async () => {
				throw new PartitionCheckpointPublisherError({
					message: "S3 unavailable",
					retriable: true,
				});
			},
		});
		const { runtime, identity } = createRuntime({ fixture });
		try {
			await runtime.start();
			await fixture.clock.advance(100);
			expect(runtime.getHealth()).toMatchObject({
				status: "ready",
				checkpoint: { status: "degraded" },
			});
			const decision = await runtime.process((processor) =>
				processor.track({
					command: parseTrackCommand({
						input: {
							schemaVersion: 1,
							type: "track",
							commandId: "track_during_s3_failure",
							requestId: "request",
							identity,
							entityId: null,
							featureId: "messages",
							value: 5,
							overageBehavior: "reject",
							properties: null,
							occurredAt: fixture.clock.now(),
						},
					}),
				}),
			);
			expect(decision.kind).toBe("new");
			const check = await runtime.process((processor) =>
				processor.check({
					command: parseCheckCommand({
						input: {
							schemaVersion: 1,
							type: "check",
							requestId: "check",
							identity,
							entityId: null,
							featureId: "messages",
							requiredBalance: 5,
							properties: null,
							occurredAt: fixture.clock.now(),
						},
					}),
				}),
			);
			expect(check).toMatchObject({ allowed: true, balance: 5 });
		} finally {
			await runtime.stop();
			fixture.close();
		}
	});
});

import { describe, expect, test } from "bun:test";
import { ownedPartitionHealthOf } from "../../../src/health/ownedPartitionHealth.js";
import { createPartitions } from "../../../src/partitions/createPartitions.js";
import type {
	PartitionChangeListeners,
	PartitionOffsets,
	PartitionsDependencies,
} from "../../../src/partitions/types/partitions.js";
import { PartitionBootstrapRefusedError } from "../../../src/runtime/bootstrap/partitionBootstrapErrors.js";

import {
	createTestRuntimeResources,
	type LifecycleTestRuntime,
} from "./ownershipTestFixtures.js";

type LifecycleTestFactory = (params: { topic: string; partition: number }) => {
	runtime: LifecycleTestRuntime;
	markUnavailable(failure: { cause: unknown }): void;
};

const topic = "metering-events-v1";

const createDeferred = () => {
	let resolve = (): void => undefined;
	const promise = new Promise<void>((settle) => {
		resolve = settle;
	});
	return { promise, resolve };
};

const waitFor = async (condition: () => boolean): Promise<void> => {
	for (let attempt = 0; attempt < 100; attempt += 1) {
		if (condition()) return;
		await new Promise<void>((resolve) => setTimeout(resolve, 1));
	}
	throw new Error("Condition was not reached");
};

const createOwnershipFixture = ({
	createRuntime,
	fetchHighWatermarks,
	consumerStartFailure,
	consumerStopFailure,
	offsetsStopFailure,
	healthRefreshIntervalMs = 5_000,
}: {
	createRuntime?: LifecycleTestFactory;
	fetchHighWatermarks?: PartitionOffsets["fetchHighWatermarks"];
	consumerStartFailure?: Error;
	consumerStopFailure?: Error;
	offsetsStopFailure?: Error;
	healthRefreshIntervalMs?: number;
} = {}) => {
	const lifecycle: string[] = [];
	const errors: unknown[] = [];
	const observedHighWatermarks: bigint[] = [];
	let listeners: PartitionChangeListeners | null = null;
	const readHighWatermark = (): bigint => 0n;
	const dependencies: PartitionsDependencies = {
		consumer: {
			start: async () => {
				lifecycle.push("consumer-start");
				if (consumerStartFailure) throw consumerStartFailure;
			},
			stop: async () => {
				lifecycle.push("consumer-stop");
				if (consumerStopFailure) throw consumerStopFailure;
			},
			pause: ({ partitions }) => {
				lifecycle.push(`pause:${partitions.join(",")}`);
			},
		},
		partitionOffsets: {
			connect: async () => {
				lifecycle.push("offsets-connect");
			},
			disconnect: async () => {
				lifecycle.push("offsets-disconnect");
				if (offsetsStopFailure) throw offsetsStopFailure;
			},
			fetchHighWatermarks:
				fetchHighWatermarks ?? (async () => ({ readHighWatermark })),
		},
		progress: {
			readProgress: () => ({
				localNextOffset: 0n,
				consumedNextOffset: 0n,
				highWatermark: 0n,
			}),
			observeHighWatermark: ({ highWatermark }) => {
				observedHighWatermarks.push(highWatermark);
			},
		},
		subscribePartitionChanges: (subscribers) => {
			lifecycle.push("subscribe");
			listeners = subscribers;
			return () => {
				lifecycle.push("unsubscribe");
			};
		},
		createRuntime: createRuntime
			? (params) => createTestRuntimeResources(createRuntime(params))
			: ({ partition }) => {
					lifecycle.push(`create:${partition}`);
					return createTestRuntimeResources({
						markUnavailable: () => {
							lifecycle.push(`unavailable:${partition}`);
						},
						runtime: {
							start: async () => {
								lifecycle.push(`start:${partition}`);
							},
							stop: async () => {
								lifecycle.push(`stop:${partition}`);
							},
							getHealth: () =>
								ownedPartitionHealthOf({
									topic,
									partition,
									status: "ready",
									localNextOffset: 0n,
									consumedNextOffset: 0n,
									highWatermark: 0n,
									failureReason: null,
								}),
						},
					});
				},
		onError: ({ cause }) => {
			errors.push(cause);
			lifecycle.push("error");
		},
		onUnhealthyPartition: () => {
			lifecycle.push("unhealthy");
		},
	};
	const ownership = createPartitions({
		ctx: dependencies,
		config: {
			topic,
			healthRefreshIntervalMs,
			partitionBootstrapRetryIntervalMs: 1,
		},
	});
	const causeForPartition = ({ partition }: { partition: number }): Error =>
		new Error(`assignment revoked for ${partition}`);
	const assign = (partitions: number[]): void => {
		listeners?.onAssigned({ partitions, causeForPartition });
	};
	const revoke = (): void => {
		listeners?.onRevoked({ causeForPartition });
	};
	const crash = (cause: unknown): void => {
		listeners?.onCrashed({ cause });
	};
	return {
		ownership,
		lifecycle,
		errors,
		observedHighWatermarks,
		assign,
		revoke,
		crash,
	};
};

describe("Partition ownership neutral capabilities", () => {
	test("pauses before construction and preserves crash retirement order", async () => {
		const fixture = createOwnershipFixture();
		await fixture.ownership.start();
		fixture.assign([0]);
		await waitFor(() => fixture.lifecycle.includes("start:0"));
		expect(fixture.lifecycle).toEqual([
			"subscribe",
			"offsets-connect",
			"consumer-start",
			"pause:0",
			"create:0",
			"start:0",
		]);
		const crash = new Error("consumer failed");
		fixture.crash(crash);
		await waitFor(() => fixture.lifecycle.includes("stop:0"));
		expect(fixture.lifecycle.slice(-3)).toEqual([
			"unavailable:0",
			"error",
			"stop:0",
		]);
		expect(fixture.errors).toEqual([crash]);
		await fixture.ownership.stop();
		expect(fixture.lifecycle.slice(-3)).toEqual([
			"unsubscribe",
			"consumer-stop",
			"offsets-disconnect",
		]);
	});

	test("aggregates shared cleanup failures and settles runtime stop errors first", async () => {
		const consumerStopFailure = new Error("consumer stop failed");
		const offsetsStopFailure = new Error("offsets disconnect failed");
		const runtimeStopFailure = new Error("runtime stop failed");
		const fixture = createOwnershipFixture({
			consumerStopFailure,
			offsetsStopFailure,
			createRuntime: ({ partition }) => ({
				markUnavailable: () => undefined,
				runtime: {
					start: async () => undefined,
					stop: async () => {
						throw runtimeStopFailure;
					},
					getHealth: () =>
						ownedPartitionHealthOf({
							topic,
							partition,
							status: "ready",
							localNextOffset: 0n,
							consumedNextOffset: 0n,
							highWatermark: 0n,
							failureReason: null,
						}),
				},
			}),
		});
		await fixture.ownership.start();
		fixture.assign([0]);
		await waitFor(() => fixture.ownership.partitions().length === 1);
		const stopping = fixture.ownership.stop();
		expect(fixture.ownership.stop()).toBe(stopping);
		const failure = await stopping.catch((cause: unknown) => cause);
		expect(failure).toBeInstanceOf(AggregateError);
		expect(failure).toMatchObject({
			message: "Failed to stop Kafka owned partition group",
			errors: [
				expect.objectContaining({ errors: [runtimeStopFailure] }),
				consumerStopFailure,
				offsetsStopFailure,
			],
		});
		expect(fixture.lifecycle.slice(-2)).toEqual([
			"consumer-stop",
			"offsets-disconnect",
		]);
	});

	test("disconnects offsets and preserves the initial consumer startup failure", async () => {
		const consumerStartFailure = new Error("consumer cannot start");
		const fixture = createOwnershipFixture({
			consumerStartFailure,
			offsetsStopFailure: new Error("offsets disconnect failed"),
		});
		await expect(fixture.ownership.start()).rejects.toBe(consumerStartFailure);
		expect(fixture.lifecycle).toEqual([
			"subscribe",
			"offsets-connect",
			"consumer-start",
			"unsubscribe",
			"offsets-disconnect",
		]);
		fixture.assign([0]);
		await fixture.ownership.stop();
		expect(fixture.ownership.partitions()).toEqual([]);
		expect(fixture.lifecycle).not.toContain("consumer-stop");
	});

	test("discards stale high watermark snapshots before reading or applying them", async () => {
		const healthGate = createDeferred();
		let fetching = false;
		let snapshotsRead = 0;
		const fixture = createOwnershipFixture({
			healthRefreshIntervalMs: 1,
			fetchHighWatermarks: async () => {
				fetching = true;
				await healthGate.promise;
				return {
					readHighWatermark: () => {
						snapshotsRead += 1;
						return 5n;
					},
				};
			},
		});
		await fixture.ownership.start();
		fixture.assign([0]);
		await waitFor(() => fetching);
		fixture.revoke();
		healthGate.resolve();
		await fixture.ownership.stop();
		expect(snapshotsRead).toBe(0);
		expect(fixture.observedHighWatermarks).toEqual([]);
	});

	test("does not retry a parked runtime after revocation while cleanup is pending", async () => {
		const cleanupGate = createDeferred();
		let constructions = 0;
		let cleanupCalls = 0;
		const fixture = createOwnershipFixture({
			createRuntime: ({ partition }) => {
				constructions += 1;
				return {
					markUnavailable: () => undefined,
					runtime: {
						start: async () => {
							throw new PartitionBootstrapRefusedError({
								topic,
								partition,
								reason: "checkpoint_required_for_retention_gap",
							});
						},
						stop: async () => {
							cleanupCalls += 1;
							await cleanupGate.promise;
						},
						getHealth: () =>
							ownedPartitionHealthOf({
								topic,
								partition,
								status: "recovery_required",
								localNextOffset: 0n,
								consumedNextOffset: 0n,
								highWatermark: 0n,
								failureReason: "checkpoint_required_for_retention_gap",
							}),
					},
				};
			},
		});
		await fixture.ownership.start();
		fixture.assign([0]);
		await waitFor(() => cleanupCalls === 1);
		fixture.revoke();
		expect(constructions).toBe(1);
		cleanupGate.resolve();
		await fixture.ownership.stop();
		expect(constructions).toBe(1);
		expect(cleanupCalls).toBe(2);
	});

	test("stops the group instead of retrying when parked runtime cleanup fails", async () => {
		const cleanupFailure = new Error("cannot drain parked runtime");
		let constructions = 0;
		const fixture = createOwnershipFixture({
			createRuntime: ({ partition }) => {
				constructions += 1;
				return {
					markUnavailable: () => undefined,
					runtime: {
						start: async () => {
							throw new PartitionBootstrapRefusedError({
								topic,
								partition,
								reason: "checkpoint_required_for_retention_gap",
							});
						},
						stop: async () => {
							throw cleanupFailure;
						},
						getHealth: () =>
							ownedPartitionHealthOf({
								topic,
								partition,
								status: "recovery_required",
								localNextOffset: 0n,
								consumedNextOffset: 0n,
								highWatermark: 0n,
								failureReason: "checkpoint_required_for_retention_gap",
							}),
					},
				};
			},
		});
		await fixture.ownership.start();
		fixture.assign([0]);
		await waitFor(() => fixture.lifecycle.includes("consumer-stop"));
		await expect(fixture.ownership.stop()).rejects.toBeDefined();
		expect(constructions).toBe(1);
		expect(fixture.errors).toContain(cleanupFailure);
	});
});

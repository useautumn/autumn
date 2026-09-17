import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	type CheckCommand,
	createCustomerMeteringState,
	type MeteringIdentity,
	parseCheckCommand,
	parseTrackCommand,
	type TrackCommand,
	type TrackDecision,
} from "@autumn/balance-engine";
import {
	createProducerSession,
	type KafkaTransaction as KafkaTrackOutcomeTransactionPort,
	type KafkaProducerClient as OwnedPartitionProducerPort,
} from "@autumn/kafka";
import { Glob } from "bun";
import type { ProducerRecord, RecordMetadata } from "kafkajs";
import ts from "typescript";
import { createTrackOutcomePublisher } from "../../../src/kafka/createTrackOutcomePublisher.js";
import {
	createWorkerProducer,
	createWorkerProducerConfig,
} from "../../../src/kafka/createWorkerProducer.js";
import { createPartitionRuntime } from "../../../src/runtime/createPartitionRuntime.js";
import { createRequestTracker } from "../../../src/runtime/createRequestTracker.js";
import {
	OwnedPartitionNotReadyError,
	OwnedPartitionProducerFencedError,
	OwnedPartitionRecoveryRequiredError,
} from "../../../src/runtime/runtimeErrors.js";
import type { PartitionOutcomeFollowerPort } from "../../../src/runtime/types/partitionRuntime.js";
import {
	openSqliteBalanceStateStore,
	type SqliteBalanceStateStore,
} from "../../../src/state/sqliteBalanceStateStore.js";
import { TrackOutcomeBatchAppendError } from "../../../src/writer/partitionTrackWriter.js";

const topic = "metering-events-v1";
const partition = 2;
const identity = {
	orgId: "org_1",
	env: "sandbox",
	customerId: "cus_1",
} as const;

const createState = ({
	stateIdentity = identity,
	balance = 10,
}: {
	stateIdentity?: MeteringIdentity;
	balance?: number;
} = {}) =>
	createCustomerMeteringState({
		identity: stateIdentity,
		featureStatesById: {
			messages: {
				kind: "direct_metered_v1",
				customerEntitlements: [{ id: "messages_monthly", balance, usage: 0 }],
			},
		},
	});

const createTrackCommand = ({
	commandId,
	commandIdentity = identity,
}: {
	commandId: string;
	commandIdentity?: MeteringIdentity;
}): TrackCommand =>
	parseTrackCommand({
		input: {
			schemaVersion: 1,
			type: "track",
			commandId,
			requestId: `req_${commandId}`,
			identity: commandIdentity,
			entityId: null,
			featureId: "messages",
			value: 5,
			overageBehavior: "reject",
			properties: null,
			occurredAt: 1_700_000_000_000,
		},
	});

const createCheckCommand = ({
	requestId,
	commandIdentity = identity,
}: {
	requestId: string;
	commandIdentity?: MeteringIdentity;
}): CheckCommand =>
	parseCheckCommand({
		input: {
			schemaVersion: 1,
			type: "check",
			requestId,
			identity: commandIdentity,
			entityId: null,
			featureId: "messages",
			requiredBalance: 1,
			properties: null,
			occurredAt: 1_700_000_000_000,
		},
	});

type Deferred<T> = {
	promise: Promise<T>;
	resolve: (value: T) => void;
	reject: (error: unknown) => void;
};

const createDeferred = <T>(): Deferred<T> => {
	let resolveDeferred: Deferred<T>["resolve"] | null = null;
	let rejectDeferred: Deferred<T>["reject"] | null = null;
	const promise = new Promise<T>((resolve, reject) => {
		resolveDeferred = resolve;
		rejectDeferred = reject;
	});
	if (!resolveDeferred || !rejectDeferred) {
		throw new Error("Expected deferred callbacks");
	}
	return { promise, resolve: resolveDeferred, reject: rejectDeferred };
};

type FakeProducerOptions = {
	appendCommitGate?: Promise<void>;
	appendCommitError?: Error;
	appendSendError?: Error;
	appendAbortError?: Error;
};

const createFakeProducer = ({
	appendCommitGate = Promise.resolve(),
	appendCommitError,
	appendSendError,
	appendAbortError,
}: FakeProducerOptions = {}): {
	producer: OwnedPartitionProducerPort;
	lifecycle: string[];
	records: ProducerRecord[];
} => {
	const lifecycle: string[] = [];
	const records: ProducerRecord[] = [];
	let transactionCount = 0;
	let nextOffset = 0n;

	const producer: OwnedPartitionProducerPort = {
		connect: async () => {
			lifecycle.push("producer:connect");
		},
		disconnect: async () => {
			lifecycle.push("producer:disconnect");
		},
		transaction: async () => {
			const currentTransaction = transactionCount;
			transactionCount += 1;
			lifecycle.push(
				currentTransaction === 0
					? "producer:fence"
					: "producer:append-transaction",
			);

			const transaction: KafkaTrackOutcomeTransactionPort = {
				send: async (record) => {
					if (currentTransaction === 0) {
						throw new Error("Fence transaction cannot send records");
					}
					lifecycle.push("producer:send");
					records.push(record);
					if (appendSendError) throw appendSendError;
					const baseOffset = nextOffset;
					nextOffset += BigInt(record.messages.length);
					return [
						{
							topicName: topic,
							partition,
							errorCode: 0,
							baseOffset: baseOffset.toString(),
						},
					] satisfies RecordMetadata[];
				},
				commit: async () => {
					lifecycle.push("producer:commit");
					await appendCommitGate;
					if (currentTransaction > 0 && appendCommitError) {
						throw appendCommitError;
					}
				},
				abort: async () => {
					lifecycle.push(
						currentTransaction === 0
							? "producer:fence-abort"
							: "producer:abort",
					);
					if (currentTransaction > 0 && appendAbortError) {
						throw appendAbortError;
					}
				},
			};
			return transaction;
		},
	};

	return { producer, lifecycle, records };
};

const createFollower = ({
	catchUpGate = Promise.resolve(),
	stopError,
}: {
	catchUpGate?: Promise<void>;
	stopError?: Error;
} = {}): {
	follower: PartitionOutcomeFollowerPort;
	lifecycle: string[];
	emitUnavailable: ({ cause }: { cause: unknown }) => void;
} => {
	const lifecycle: string[] = [];
	let unavailableListener: (({ cause }: { cause: unknown }) => void) | null =
		null;
	return {
		lifecycle,
		follower: {
			startAndCatchUp: async ({ onUnavailable }) => {
				lifecycle.push("follower:start");
				unavailableListener = onUnavailable;
				await catchUpGate;
				lifecycle.push("follower:caught-up");
			},
			stop: async () => {
				lifecycle.push("follower:stop");
				if (stopError) throw stopError;
			},
		},
		emitUnavailable: ({ cause }) => {
			if (!unavailableListener) {
				throw new Error("Follower has no unavailability listener");
			}
			unavailableListener({ cause });
		},
	};
};

const createStoreFixture = (): {
	directory: string;
	store: SqliteBalanceStateStore;
} => {
	const directory = mkdtempSync(join(tmpdir(), "autumn-owned-partition-"));
	const store = openSqliteBalanceStateStore({
		databasePath: join(directory, "balance-state.sqlite"),
	});
	store.initializePartition({ topic, partition, nextOffset: 0n });
	store.initializeState({ state: createState() });
	return { directory, store };
};

const closeStoreFixture = ({
	directory,
	store,
}: {
	directory: string;
	store: SqliteBalanceStateStore;
}): void => {
	store.close();
	rmSync(directory, { recursive: true, force: true });
};

const waitForTurn = async (): Promise<void> => {
	await new Promise<void>((resolve) => setImmediate(resolve));
};

const writerLimits = {
	maxBatchSize: 100,
	maxPendingCommands: 1_000,
	maxPendingCommandsPerCustomer: 100,
};

const createRuntime = ({
	store,
	producer,
	follower,
	partitionForIdentity = () => partition,
	recoveryDrainTimeoutMs = 1_000,
}: {
	store: SqliteBalanceStateStore;
	producer: OwnedPartitionProducerPort;
	follower: PartitionOutcomeFollowerPort;
	partitionForIdentity?: (identity: MeteringIdentity) => number;
	recoveryDrainTimeoutMs?: number;
}) => {
	function createProducer(): OwnedPartitionProducerPort {
		return producer;
	}
	const session = createProducerSession({
		ctx: { kafka: { producer: createProducer } },
		config: createWorkerProducerConfig({
			deploymentEnvironment: "test",
			topic,
			partition,
			limits: {
				transactionTimeoutMs: 15_000,
				retryCount: 3,
				initialRetryTimeMs: 100,
				maxRetryTimeMs: 2_000,
			},
		}),
	});
	const workerProducer = createWorkerProducer({
		ctx: { session },
		config: { topic, partition },
	});
	return createPartitionRuntime({
		config: { topic, partition, writerLimits, recoveryDrainTimeoutMs },
		ctx: {
			stateStore: store,
			producer: workerProducer,
			follower,
			appender: createTrackOutcomePublisher({
				ctx: { producer: workerProducer },
			}),
			partitionResolver: {
				partitionForIdentity: ({ identity: commandIdentity }) =>
					partitionForIdentity(commandIdentity),
			},
		},
	});
};

describe("owned partition runtime", () => {
	test("fences the previous owner and catches up before serving", async () => {
		const fixture = createStoreFixture();
		const catchUp = createDeferred<void>();
		const fakeProducer = createFakeProducer();
		const fakeFollower = createFollower({ catchUpGate: catchUp.promise });
		const runtime = createRuntime({
			store: fixture.store,
			producer: fakeProducer.producer,
			follower: fakeFollower.follower,
		});

		try {
			const startPromise = runtime.start();
			await waitForTurn();

			expect(runtime.getStatus()).toBe("starting");
			expect(fakeProducer.lifecycle).toEqual([
				"producer:connect",
				"producer:fence",
				"producer:fence-abort",
			]);
			expect(fakeFollower.lifecycle).toEqual(["follower:start"]);
			await expect(
				runtime.check({ command: createCheckCommand({ requestId: "req_1" }) }),
			).rejects.toBeInstanceOf(OwnedPartitionNotReadyError);

			catchUp.resolve(undefined);
			await startPromise;

			expect(runtime.getStatus()).toBe("ready");
			expect(fakeFollower.lifecycle).toEqual([
				"follower:start",
				"follower:caught-up",
			]);
			await expect(
				runtime.check({ command: createCheckCommand({ requestId: "req_2" }) }),
			).resolves.toMatchObject({ kind: "decided", balance: 10, revision: 0 });
		} finally {
			await runtime.stop();
			closeStoreFixture(fixture);
		}
	});

	test("disposes the partition when catch-up fails", async () => {
		const fixture = createStoreFixture();
		const fakeProducer = createFakeProducer();
		const catchUpError = new Error("catch-up failed");
		const fakeFollower = createFollower({
			catchUpGate: Promise.reject(catchUpError),
		});
		const runtime = createRuntime({
			store: fixture.store,
			producer: fakeProducer.producer,
			follower: fakeFollower.follower,
		});

		try {
			await expect(runtime.start()).rejects.toBeInstanceOf(
				OwnedPartitionRecoveryRequiredError,
			);
			expect(runtime.getStatus()).toBe("recovery_required");
			expect(fakeFollower.lifecycle.at(-1)).toBe("follower:stop");
			expect(fakeProducer.lifecycle.at(-1)).toBe("producer:disconnect");
		} finally {
			await runtime.stop();
			closeStoreFixture(fixture);
		}
	});

	test("cancels catch-up and disconnects when revoked during startup", async () => {
		const fixture = createStoreFixture();
		const fakeProducer = createFakeProducer();
		const catchUpStopped = createDeferred<void>();
		const followerLifecycle: string[] = [];
		const runtime = createRuntime({
			store: fixture.store,
			producer: fakeProducer.producer,
			follower: {
				startAndCatchUp: async () => {
					followerLifecycle.push("follower:start");
					await catchUpStopped.promise;
				},
				stop: async () => {
					followerLifecycle.push("follower:stop");
					catchUpStopped.resolve(undefined);
				},
			},
		});

		try {
			const startPromise = runtime.start();
			await waitForTurn();
			await runtime.stop();
			await expect(startPromise).rejects.toBeInstanceOf(
				OwnedPartitionNotReadyError,
			);

			expect(runtime.getStatus()).toBe("stopped");
			expect(followerLifecycle).toEqual(["follower:start", "follower:stop"]);
			expect(fakeProducer.lifecycle.at(-1)).toBe("producer:disconnect");
		} finally {
			await runtime.stop();
			closeStoreFixture(fixture);
		}
	});

	test("makes a later check wait for the customer's committed track", async () => {
		const fixture = createStoreFixture();
		const commit = createDeferred<void>();
		const fakeProducer = createFakeProducer({
			appendCommitGate: commit.promise,
		});
		const runtime = createRuntime({
			store: fixture.store,
			producer: fakeProducer.producer,
			follower: createFollower().follower,
		});

		try {
			await runtime.start();
			const trackPromise = runtime.submitTrack({
				command: createTrackCommand({ commandId: "cmd_1" }),
			});
			const checkPromise = runtime.check({
				command: createCheckCommand({ requestId: "req_after_track" }),
			});
			let checkSettled = false;
			void checkPromise.finally(() => {
				checkSettled = true;
			});

			await waitForTurn();
			expect(fakeProducer.lifecycle).toContain("producer:commit");
			expect(checkSettled).toBe(false);

			commit.resolve(undefined);
			await expect(trackPromise).resolves.toMatchObject({
				kind: "new",
				outcome: { status: "applied", balanceAfter: 5 },
			});
			await expect(checkPromise).resolves.toMatchObject({
				kind: "decided",
				balance: 5,
				revision: 1,
			});
		} finally {
			await runtime.stop();
			closeStoreFixture(fixture);
		}
	});

	test("revokes readiness when the live follower becomes unavailable", async () => {
		const fixture = createStoreFixture();
		const fakeProducer = createFakeProducer();
		const fakeFollower = createFollower();
		const runtime = createRuntime({
			store: fixture.store,
			producer: fakeProducer.producer,
			follower: fakeFollower.follower,
		});

		try {
			await runtime.start();
			fakeFollower.emitUnavailable({
				cause: new Error("outcome follower stopped"),
			});
			await waitForTurn();

			expect(runtime.getStatus()).toBe("recovery_required");
			await expect(
				runtime.check({
					command: createCheckCommand({ requestId: "req_after_failure" }),
				}),
			).rejects.toBeInstanceOf(OwnedPartitionRecoveryRequiredError);
			await expect(
				runtime.submitTrack({
					command: createTrackCommand({ commandId: "cmd_after_failure" }),
				}),
			).rejects.toBeInstanceOf(OwnedPartitionRecoveryRequiredError);
			expect(fakeFollower.lifecycle.at(-1)).toBe("follower:stop");
			expect(fakeProducer.lifecycle.at(-1)).toBe("producer:disconnect");
			expect(fakeProducer.records).toHaveLength(0);
		} finally {
			await runtime.stop();
			closeStoreFixture(fixture);
		}
	});

	test("drains accepted work before disconnecting after follower loss", async () => {
		const fixture = createStoreFixture();
		const commit = createDeferred<void>();
		const fakeProducer = createFakeProducer({
			appendCommitGate: commit.promise,
		});
		const fakeFollower = createFollower();
		const runtime = createRuntime({
			store: fixture.store,
			producer: fakeProducer.producer,
			follower: fakeFollower.follower,
		});
		let trackPromise: ReturnType<typeof runtime.submitTrack> | null = null;

		try {
			await runtime.start();
			trackPromise = runtime.submitTrack({
				command: createTrackCommand({ commandId: "cmd_1" }),
			});
			await waitForTurn();
			expect(fakeProducer.lifecycle).toContain("producer:commit");

			fakeFollower.emitUnavailable({
				cause: new Error("outcome follower stopped"),
			});
			await waitForTurn();

			expect(runtime.getStatus()).toBe("recovery_required");
			expect(fakeProducer.lifecycle).not.toContain("producer:disconnect");

			commit.resolve(undefined);
			await expect(trackPromise).resolves.toMatchObject({
				kind: "new",
				outcome: { status: "applied", balanceAfter: 5 },
			});
			await runtime.stop();

			expect(fakeProducer.lifecycle.at(-1)).toBe("producer:disconnect");
			expect(fixture.store.readState({ identity })?.revision).toBe(1);
		} finally {
			commit.resolve(undefined);
			await trackPromise?.catch(() => undefined);
			await runtime.stop();
			closeStoreFixture(fixture);
		}
	});

	test("finishes follower-loss recovery when accepted work fails", async () => {
		const fixture = createStoreFixture();
		const commit = createDeferred<void>();
		const fakeProducer = createFakeProducer({
			appendCommitGate: commit.promise,
			appendCommitError: new Error("commit response lost"),
		});
		const fakeFollower = createFollower();
		const runtime = createRuntime({
			store: fixture.store,
			producer: fakeProducer.producer,
			follower: fakeFollower.follower,
		});
		let trackPromise: ReturnType<typeof runtime.submitTrack> | null = null;

		try {
			await runtime.start();
			trackPromise = runtime.submitTrack({
				command: createTrackCommand({ commandId: "cmd_1" }),
			});
			await waitForTurn();

			fakeFollower.emitUnavailable({
				cause: new Error("outcome follower stopped"),
			});
			commit.resolve(undefined);

			await expect(trackPromise).rejects.toBeInstanceOf(
				OwnedPartitionRecoveryRequiredError,
			);
			await runtime.stop();

			expect(fakeProducer.lifecycle.at(-1)).toBe("producer:disconnect");
		} finally {
			commit.resolve(undefined);
			await trackPromise?.catch(() => undefined);
			await runtime.stop();
			closeStoreFixture(fixture);
		}
	});

	test("bounds the follower-loss drain before disconnecting", async () => {
		const fixture = createStoreFixture();
		const commit = createDeferred<void>();
		const fakeProducer = createFakeProducer({
			appendCommitGate: commit.promise,
		});
		const fakeFollower = createFollower();
		const runtime = createRuntime({
			store: fixture.store,
			producer: fakeProducer.producer,
			follower: fakeFollower.follower,
			recoveryDrainTimeoutMs: 1,
		});
		let trackPromise: ReturnType<typeof runtime.submitTrack> | null = null;

		try {
			await runtime.start();
			trackPromise = runtime.submitTrack({
				command: createTrackCommand({ commandId: "cmd_1" }),
			});
			await waitForTurn();

			fakeFollower.emitUnavailable({
				cause: new Error("outcome follower stopped"),
			});
			await runtime.stop();

			expect(runtime.getStatus()).toBe("recovery_required");
			expect(fakeProducer.lifecycle.at(-1)).toBe("producer:disconnect");
		} finally {
			commit.resolve(undefined);
			await trackPromise?.catch(() => undefined);
			await runtime.stop();
			closeStoreFixture(fixture);
		}
	});

	test("drains accepted work before disconnecting on revoke", async () => {
		const fixture = createStoreFixture();
		const commit = createDeferred<void>();
		const fakeProducer = createFakeProducer({
			appendCommitGate: commit.promise,
		});
		const fakeFollower = createFollower();
		const runtime = createRuntime({
			store: fixture.store,
			producer: fakeProducer.producer,
			follower: fakeFollower.follower,
		});

		try {
			await runtime.start();
			const trackPromise = runtime.submitTrack({
				command: createTrackCommand({ commandId: "cmd_1" }),
			});
			await waitForTurn();
			const stopPromise = runtime.stop();

			expect(runtime.getStatus()).toBe("draining");
			await expect(
				runtime.check({
					command: createCheckCommand({ requestId: "req_late" }),
				}),
			).rejects.toBeInstanceOf(OwnedPartitionNotReadyError);
			expect(fakeProducer.lifecycle).not.toContain("producer:disconnect");

			commit.resolve(undefined);
			await trackPromise;
			await stopPromise;

			expect(runtime.getStatus()).toBe("stopped");
			expect(fakeFollower.lifecycle.at(-1)).toBe("follower:stop");
			expect(fakeProducer.lifecycle.at(-1)).toBe("producer:disconnect");
		} finally {
			await runtime.stop();
			closeStoreFixture(fixture);
		}
	});

	test("parks and discards a producer fenced during append", async () => {
		const fixture = createStoreFixture();
		const fencedError = Object.assign(new Error("producer fenced"), {
			type: "INVALID_PRODUCER_EPOCH",
			code: 47,
		});
		const fakeProducer = createFakeProducer({
			appendSendError: fencedError,
		});
		const fakeFollower = createFollower({
			stopError: new Error("follower cleanup failed"),
		});
		const runtime = createRuntime({
			store: fixture.store,
			producer: fakeProducer.producer,
			follower: fakeFollower.follower,
		});

		try {
			await runtime.start();
			await expect(
				runtime.submitTrack({
					command: createTrackCommand({ commandId: "cmd_1" }),
				}),
			).rejects.toBeInstanceOf(OwnedPartitionProducerFencedError);

			expect(runtime.getStatus()).toBe("recovery_required");
			expect(fakeFollower.lifecycle.at(-1)).toBe("follower:stop");
			expect(
				fakeProducer.lifecycle.filter(
					(stage) => stage === "producer:disconnect",
				),
			).toHaveLength(1);
			await expect(
				runtime.check({
					command: createCheckCommand({ requestId: "req_late" }),
				}),
			).rejects.toBeInstanceOf(OwnedPartitionProducerFencedError);
		} finally {
			await runtime.stop();
			closeStoreFixture(fixture);
		}
	});

	test("keeps serving after a non-fencing append is safely aborted", async () => {
		const fixture = createStoreFixture();
		const fakeProducer = createFakeProducer({
			appendSendError: new Error("broker unavailable"),
		});
		const runtime = createRuntime({
			store: fixture.store,
			producer: fakeProducer.producer,
			follower: createFollower().follower,
		});

		try {
			await runtime.start();
			await expect(
				runtime.submitTrack({
					command: createTrackCommand({ commandId: "cmd_1" }),
				}),
			).rejects.toBeInstanceOf(TrackOutcomeBatchAppendError);

			expect(runtime.getStatus()).toBe("ready");
			await expect(
				runtime.check({
					command: createCheckCommand({ requestId: "req_after_abort" }),
				}),
			).resolves.toMatchObject({ kind: "decided", balance: 10, revision: 0 });
		} finally {
			await runtime.stop();
			closeStoreFixture(fixture);
		}
	});

	test("parks and discards a producer after an ambiguous commit", async () => {
		const fixture = createStoreFixture();
		const fakeProducer = createFakeProducer({
			appendCommitError: new Error("commit response lost"),
		});
		const fakeFollower = createFollower();
		const runtime = createRuntime({
			store: fixture.store,
			producer: fakeProducer.producer,
			follower: fakeFollower.follower,
		});

		try {
			await runtime.start();
			const error = await runtime
				.submitTrack({
					command: createTrackCommand({ commandId: "cmd_1" }),
				})
				.catch((cause: unknown) => cause);

			expect(error).toBeInstanceOf(OwnedPartitionRecoveryRequiredError);
			expect(error).not.toBeInstanceOf(OwnedPartitionProducerFencedError);
			expect(runtime.getStatus()).toBe("recovery_required");
			expect(fakeFollower.lifecycle.at(-1)).toBe("follower:stop");
			expect(fakeProducer.lifecycle.at(-1)).toBe("producer:disconnect");
		} finally {
			await runtime.stop();
			closeStoreFixture(fixture);
		}
	});

	test("preserves recovery status when revoke races an ambiguous commit", async () => {
		const fixture = createStoreFixture();
		const commit = createDeferred<void>();
		const fakeProducer = createFakeProducer({
			appendCommitGate: commit.promise,
			appendCommitError: new Error("commit response lost"),
		});
		const runtime = createRuntime({
			store: fixture.store,
			producer: fakeProducer.producer,
			follower: createFollower().follower,
		});

		try {
			await runtime.start();
			const trackPromise = runtime.submitTrack({
				command: createTrackCommand({ commandId: "cmd_1" }),
			});
			await waitForTurn();
			const stopPromise = runtime.stop();
			commit.resolve(undefined);

			await expect(trackPromise).rejects.toBeInstanceOf(
				OwnedPartitionRecoveryRequiredError,
			);
			await stopPromise;
			expect(runtime.getStatus()).toBe("recovery_required");
		} finally {
			await runtime.stop();
			closeStoreFixture(fixture);
		}
	});

	test("rejects commands that do not belong to the owned partition", async () => {
		const fixture = createStoreFixture();
		const fakeProducer = createFakeProducer();
		const runtime = createRuntime({
			store: fixture.store,
			producer: fakeProducer.producer,
			follower: createFollower().follower,
			partitionForIdentity: () => partition + 1,
		});

		try {
			await runtime.start();
			await expect(
				runtime.submitTrack({
					command: createTrackCommand({ commandId: "cmd_wrong_partition" }),
				}),
			).rejects.toThrow("does not belong to owned partition");
			await expect(
				runtime.check({
					command: createCheckCommand({ requestId: "req_wrong" }),
				}),
			).rejects.toThrow("does not belong to owned partition");
			expect(fakeProducer.records).toHaveLength(0);
		} finally {
			await runtime.stop();
			closeStoreFixture(fixture);
		}
	});
});

test("drain waits for accepted tracks but keeps the producer connected", async () => {
	const fixture = createStoreFixture();
	const commit = createDeferred<void>();
	const producer = createFakeProducer({ appendCommitGate: commit.promise });
	const runtime = createRuntime({
		store: fixture.store,
		producer: producer.producer,
		follower: createFollower().follower,
	});
	try {
		await runtime.start();
		const track = runtime.submitTrack({
			command: createTrackCommand({ commandId: "cmd_drain" }),
		});
		await waitForTurn();
		let drained = false;
		const draining = runtime.drain().then(() => {
			drained = true;
		});
		await waitForTurn();
		expect(drained).toBe(false);
		expect(producer.lifecycle).not.toContain("producer:disconnect");
		await expect(
			runtime.check({
				command: createCheckCommand({ requestId: "after_drain" }),
			}),
		).rejects.toBeInstanceOf(OwnedPartitionNotReadyError);
		commit.resolve(undefined);
		await track;
		await draining;
		expect(fixture.store.readState({ identity })?.revision).toBe(1);
		expect(producer.lifecycle).not.toContain("producer:disconnect");
		await runtime.stop();
		expect(producer.lifecycle.at(-1)).toBe("producer:disconnect");
	} finally {
		commit.resolve(undefined);
		await runtime.stop();
		closeStoreFixture(fixture);
	}
});

test("quiescence remains pending after recovery disposal until accepted apply settles", async () => {
	const fixture = createStoreFixture();
	const commit = createDeferred<void>();
	const producer = createFakeProducer({ appendCommitGate: commit.promise });
	const follower = createFollower();
	const runtime = createRuntime({
		store: fixture.store,
		producer: producer.producer,
		follower: follower.follower,
		recoveryDrainTimeoutMs: 1,
	});
	let track: Promise<unknown> | undefined;
	try {
		await runtime.start();
		let unavailable = false;
		runtime.subscribeUnavailable(() => {
			unavailable = true;
		});
		track = runtime.submitTrack({
			command: createTrackCommand({ commandId: "quiescence" }),
		});
		await waitForTurn();
		follower.emitUnavailable({ cause: new Error("lost follower") });
		expect(unavailable).toBe(true);
		await runtime.stop();
		let settled = false;
		const quiescence = runtime.waitForQuiescence().then(() => {
			settled = true;
		});
		await waitForTurn();
		expect(producer.lifecycle.at(-1)).toBe("producer:disconnect");
		expect(settled).toBe(false);
		commit.resolve(undefined);
		await track.catch(() => undefined);
		await quiescence;
		expect(settled).toBe(true);
	} finally {
		commit.resolve(undefined);
		await track?.catch(() => undefined);
		await runtime.stop();
		closeStoreFixture(fixture);
	}
});

async function tracksAreRemovedAfterSettlement(): Promise<void> {
	const tracker = createRequestTracker();
	const first = Promise.withResolvers<TrackDecision>();
	const later = Promise.withResolvers<TrackDecision>();
	tracker.registerTrack({ customerKey: "customer", operation: first.promise });
	const precedingTracks = tracker.precedingTracks({ customerKey: "customer" });
	tracker.registerTrack({ customerKey: "customer", operation: later.promise });

	expect(precedingTracks).toEqual([first.promise]);
	expect(tracker.precedingTracks({ customerKey: "another" })).toEqual([]);
	first.resolve({ kind: "unsupported", reason: "command_conflict" });
	await Promise.allSettled(precedingTracks);
	expect(tracker.precedingTracks({ customerKey: "customer" })).toEqual([
		later.promise,
	]);

	let drained = false;
	async function finishDrain(): Promise<void> {
		await tracker.drain();
		drained = true;
	}
	const draining = finishDrain();
	await Promise.resolve();
	expect(drained).toBe(false);
	later.reject(new Error("track rejected"));
	await draining;
	expect(drained).toBe(true);
	expect(tracker.precedingTracks({ customerKey: "customer" })).toEqual([]);
}

async function trackersKeepIndependentState(): Promise<void> {
	const first = createRequestTracker();
	const second = createRequestTracker();
	const operation = Promise.withResolvers<void>();
	const { register, drain } = first;
	expect(register({ operation: operation.promise })).toBe(operation.promise);
	await second.drain();
	operation.resolve();
	await drain();
}

test(
	"request tracking snapshots earlier tracks and drains fulfilled or rejected work",
	tracksAreRemovedAfterSettlement,
);
test(
	"request tracker methods retain independent state when detached",
	trackersKeepIndependentState,
);

function runtimeUsesNamedFunctions(): void {
	const directory = new URL("../../../src/runtime/", import.meta.url).pathname;
	const violations: string[] = [];
	for (const file of new Glob("**/*.ts").scanSync({
		cwd: directory,
		absolute: true,
	})) {
		const source = ts.createSourceFile(
			file,
			readFileSync(file, "utf8"),
			ts.ScriptTarget.Latest,
			true,
		);
		const pending: ts.Node[] = [source];
		while (pending.length > 0) {
			const node = pending.pop();
			if (!node) continue;
			const anonymous =
				ts.isArrowFunction(node) ||
				ts.isFunctionExpression(node) ||
				(ts.isFunctionDeclaration(node) && !node.name);
			const inlineMethod =
				ts.isMethodDeclaration(node) &&
				ts.isObjectLiteralExpression(node.parent);
			const callbackWiring =
				ts.isCallExpression(node) &&
				ts.isPropertyAccessExpression(node.expression) &&
				["bind", "then", "catch", "finally"].includes(
					node.expression.name.text,
				);
			if (anonymous || inlineMethod || callbackWiring) {
				const { line } = source.getLineAndCharacterOfPosition(
					node.getStart(source),
				);
				violations.push(
					`${file}:${line + 1}: ${node.getText(source).slice(0, 80)}`,
				);
			}
			pending.push(...node.getChildren(source));
		}
	}
	expect(violations).toEqual([]);
}

test(
	"runtime uses named functions without bind or callback promise chains",
	runtimeUsesNamedFunctions,
);

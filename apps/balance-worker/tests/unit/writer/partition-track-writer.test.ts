import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	createCustomerMeteringState,
	type MeteringIdentity,
	parseTrackCommand,
	type TrackCommand,
	type TrackOutcome,
} from "@autumn/balance-engine";
import {
	openSqliteBalanceStateStore,
	type SqliteBalanceStateStore,
} from "../../../src/state/sqliteBalanceStateStore.js";
import {
	type CommittedTrackOutcomeAppender,
	TrackOutcomeBatchNotCommittedError,
} from "../../../src/writer/committedTrackOutcomeAppender.js";
import {
	createPartitionTrackWriter,
	PartitionTrackWriterCapacityError,
	PartitionTrackWriterRecoveryRequiredError,
	TrackOutcomeBatchAppendError,
} from "../../../src/writer/partitionTrackWriter.js";

const topic = "metering-events-v1";
const partition = 0;
const firstIdentity = {
	orgId: "org_1",
	env: "sandbox",
	customerId: "cus_1",
} as const;
const secondIdentity = { ...firstIdentity, customerId: "cus_2" } as const;

const createState = ({
	identity,
	balance = 10,
}: {
	identity: MeteringIdentity;
	balance?: number;
}) =>
	createCustomerMeteringState({
		identity,
		featureStatesById: {
			messages: {
				kind: "direct_metered_v1",
				customerEntitlements: [{ id: "messages_monthly", balance, usage: 0 }],
			},
		},
	});

const createCommand = ({
	commandId,
	identity = firstIdentity,
	value = 5,
	properties = null,
}: {
	commandId: string;
	identity?: MeteringIdentity;
	value?: number;
	properties?: Record<string, string> | null;
}): TrackCommand =>
	parseTrackCommand({
		input: {
			schemaVersion: 1,
			type: "track",
			commandId,
			requestId: `req_${commandId}`,
			identity,
			entityId: null,
			featureId: "messages",
			value,
			overageBehavior: "reject",
			properties,
			occurredAt: 1_700_000_000_000,
		},
	});

const readBalance = ({
	store,
	identity,
}: {
	store: SqliteBalanceStateStore;
	identity: MeteringIdentity;
}) => {
	const state = store.readState({ identity });
	if (!state) throw new Error("Expected persisted metering state");
	return {
		balance: state.featureStatesById.messages?.customerEntitlements[0]?.balance,
		usage: state.featureStatesById.messages?.customerEntitlements[0]?.usage,
		revision: state.revision,
	};
};

class RecordingCommittedAppender implements CommittedTrackOutcomeAppender {
	readonly batches: TrackOutcome[][] = [];
	private nextOffset = 0n;

	async appendCommitted({
		outcomes,
	}: {
		topic: string;
		partition: number;
		outcomes: readonly TrackOutcome[];
	}): Promise<{ baseOffset: bigint }> {
		const baseOffset = this.nextOffset;
		this.batches.push([...outcomes]);
		this.nextOffset += BigInt(outcomes.length);
		return { baseOffset };
	}
}

class ControlledCommittedAppender implements CommittedTrackOutcomeAppender {
	readonly batches: TrackOutcome[][] = [];
	private resolveAppend: ((result: { baseOffset: bigint }) => void) | null =
		null;

	appendCommitted({
		outcomes,
	}: {
		topic: string;
		partition: number;
		outcomes: readonly TrackOutcome[];
	}): Promise<{ baseOffset: bigint }> {
		this.batches.push([...outcomes]);
		return new Promise((resolve) => {
			this.resolveAppend = resolve;
		});
	}

	resolve({ baseOffset = 0n }: { baseOffset?: bigint } = {}): void {
		if (!this.resolveAppend) throw new Error("No pending append");
		const resolveAppend = this.resolveAppend;
		this.resolveAppend = null;
		resolveAppend({ baseOffset });
	}
}

const createFixture = ({
	identities = [firstIdentity],
}: {
	identities?: MeteringIdentity[];
} = {}): {
	directory: string;
	store: SqliteBalanceStateStore;
} => {
	const directory = mkdtempSync(join(tmpdir(), "autumn-partition-writer-"));
	const store = openSqliteBalanceStateStore({
		databasePath: join(directory, "balance-state.sqlite"),
	});
	store.initializePartition({ topic, partition, nextOffset: 0n });
	for (const identity of identities) {
		store.initializeState({ state: createState({ identity }) });
	}
	return { directory, store };
};

const closeFixture = ({
	directory,
	store,
}: {
	directory: string;
	store: SqliteBalanceStateStore;
}) => {
	store.close();
	rmSync(directory, { recursive: true, force: true });
};

const waitForBatch = async (): Promise<void> => {
	await new Promise<void>((resolve) => setImmediate(resolve));
};

const defaultLimits = {
	maxBatchSize: 100,
	maxPendingCommands: 1_000,
	maxPendingCommandsPerCustomer: 100,
};

describe("partition track writer", () => {
	test("orders simultaneous tracks against projected customer state", async () => {
		const fixture = createFixture();
		try {
			const appender = new RecordingCommittedAppender();
			const writer = createPartitionTrackWriter({
				topic,
				partition,
				stateStore: fixture.store,
				appender,
				limits: defaultLimits,
			});

			const decisions = await Promise.all([
				writer.submitTrack({ command: createCommand({ commandId: "cmd_1" }) }),
				writer.submitTrack({ command: createCommand({ commandId: "cmd_2" }) }),
				writer.submitTrack({ command: createCommand({ commandId: "cmd_3" }) }),
			]);

			expect(decisions.map(({ kind }) => kind)).toEqual(["new", "new", "new"]);
			expect(
				decisions.map((decision) =>
					decision.kind === "new" ? decision.outcome.status : null,
				),
			).toEqual(["applied", "applied", "rejected"]);
			expect(appender.batches).toHaveLength(1);
			expect(appender.batches[0]?.map(({ commandId }) => commandId)).toEqual([
				"cmd_1",
				"cmd_2",
				"cmd_3",
			]);
			expect(
				readBalance({ store: fixture.store, identity: firstIdentity }),
			).toEqual({
				balance: 0,
				usage: 10,
				revision: 3,
			});
			expect(fixture.store.readNextOffset({ topic, partition })).toBe(3n);
		} finally {
			closeFixture(fixture);
		}
	});

	test("keeps independent customer projections in shared partition order", async () => {
		const fixture = createFixture({
			identities: [firstIdentity, secondIdentity],
		});
		try {
			const appender = new RecordingCommittedAppender();
			const writer = createPartitionTrackWriter({
				topic,
				partition,
				stateStore: fixture.store,
				appender,
				limits: defaultLimits,
			});

			await Promise.all([
				writer.submitTrack({
					command: createCommand({ commandId: "cmd_a1" }),
				}),
				writer.submitTrack({
					command: createCommand({
						commandId: "cmd_b1",
						identity: secondIdentity,
					}),
				}),
				writer.submitTrack({
					command: createCommand({ commandId: "cmd_a2" }),
				}),
			]);

			expect(appender.batches[0]?.map(({ commandId }) => commandId)).toEqual([
				"cmd_a1",
				"cmd_b1",
				"cmd_a2",
			]);
			expect(
				readBalance({ store: fixture.store, identity: firstIdentity }),
			).toEqual({
				balance: 0,
				usage: 10,
				revision: 2,
			});
			expect(
				readBalance({ store: fixture.store, identity: secondIdentity }),
			).toEqual({
				balance: 5,
				usage: 5,
				revision: 1,
			});
		} finally {
			closeFixture(fixture);
		}
	});

	test("waits for the committed append before applying or replying", async () => {
		const fixture = createFixture();
		try {
			const appender = new ControlledCommittedAppender();
			const writer = createPartitionTrackWriter({
				topic,
				partition,
				stateStore: fixture.store,
				appender,
				limits: defaultLimits,
			});
			let settled = false;
			const decisionPromise = writer
				.submitTrack({ command: createCommand({ commandId: "cmd_1" }) })
				.finally(() => {
					settled = true;
				});

			await waitForBatch();
			expect(appender.batches).toHaveLength(1);
			expect(settled).toBe(false);
			expect(
				readBalance({ store: fixture.store, identity: firstIdentity }),
			).toEqual({
				balance: 10,
				usage: 0,
				revision: 0,
			});

			appender.resolve();
			await decisionPromise;

			expect(settled).toBe(true);
			expect(
				readBalance({ store: fixture.store, identity: firstIdentity }),
			).toEqual({
				balance: 5,
				usage: 5,
				revision: 1,
			});
		} finally {
			closeFixture(fixture);
		}
	});

	test("returns its receipt when the consumer applies the outcome first", async () => {
		const fixture = createFixture();
		try {
			const appender = new ControlledCommittedAppender();
			const writer = createPartitionTrackWriter({
				topic,
				partition,
				stateStore: fixture.store,
				appender,
				limits: defaultLimits,
			});
			const decisionPromise = writer.submitTrack({
				command: createCommand({ commandId: "cmd_1" }),
			});

			await waitForBatch();
			const outcome = appender.batches[0]?.[0];
			if (!outcome) throw new Error("Expected an appended track outcome");
			expect(
				fixture.store.applyDurableTrackOutcome({
					position: { topic, partition, offset: 0n },
					outcome,
				}),
			).toMatchObject({ kind: "applied", nextOffset: 1n });

			appender.resolve();
			await expect(decisionPromise).resolves.toEqual({ kind: "new", outcome });
			expect(
				readBalance({ store: fixture.store, identity: firstIdentity }),
			).toEqual({
				balance: 5,
				usage: 5,
				revision: 1,
			});
			expect(fixture.store.readNextOffset({ topic, partition })).toBe(1n);
		} finally {
			closeFixture(fixture);
		}
	});

	test("projects commands that arrive while an earlier batch is in flight", async () => {
		const fixture = createFixture();
		try {
			const appender = new ControlledCommittedAppender();
			const writer = createPartitionTrackWriter({
				topic,
				partition,
				stateStore: fixture.store,
				appender,
				limits: defaultLimits,
			});
			const firstPromise = writer.submitTrack({
				command: createCommand({ commandId: "cmd_1", value: 6 }),
			});

			await waitForBatch();
			const secondPromise = writer.submitTrack({
				command: createCommand({ commandId: "cmd_2", value: 6 }),
			});
			expect(appender.batches).toHaveLength(1);

			appender.resolve({ baseOffset: 0n });
			await waitForBatch();
			expect(appender.batches).toHaveLength(2);
			expect(appender.batches[1]?.[0]).toMatchObject({
				commandId: "cmd_2",
				status: "rejected",
				balanceBefore: 4,
			});
			appender.resolve({ baseOffset: 1n });

			const decisions = await Promise.all([firstPromise, secondPromise]);
			expect(
				decisions.map((decision) =>
					decision.kind === "new" ? decision.outcome.status : null,
				),
			).toEqual(["applied", "rejected"]);
			expect(
				readBalance({ store: fixture.store, identity: firstIdentity }),
			).toEqual({
				balance: 4,
				usage: 6,
				revision: 2,
			});
		} finally {
			closeFixture(fixture);
		}
	});

	test("coalesces a pending command retry into one durable outcome", async () => {
		const fixture = createFixture();
		try {
			const appender = new RecordingCommittedAppender();
			const writer = createPartitionTrackWriter({
				topic,
				partition,
				stateStore: fixture.store,
				appender,
				limits: defaultLimits,
			});
			const command = createCommand({ commandId: "cmd_1" });

			const [firstDecision, retryDecision, conflictDecision] =
				await Promise.all([
					writer.submitTrack({ command }),
					writer.submitTrack({
						command: { ...command, requestId: "req_retry" },
					}),
					writer.submitTrack({ command: { ...command, value: 6 } }),
				]);

			expect(firstDecision.kind).toBe("new");
			expect(retryDecision.kind).toBe("duplicate");
			expect(retryDecision).toMatchObject({
				kind: "duplicate",
				outcome:
					firstDecision.kind === "new" ? firstDecision.outcome : undefined,
			});
			expect(conflictDecision).toEqual({
				kind: "unsupported",
				reason: "command_conflict",
			});
			expect(appender.batches).toHaveLength(1);
			expect(appender.batches[0]).toHaveLength(1);
			expect(
				readBalance({ store: fixture.store, identity: firstIdentity }),
			).toEqual({
				balance: 5,
				usage: 5,
				revision: 1,
			});
		} finally {
			closeFixture(fixture);
		}
	});

	test("clears speculative state after a definite append failure", async () => {
		const fixture = createFixture();
		try {
			let appendAttempts = 0;
			let nextOffset = 0n;
			const batches: TrackOutcome[][] = [];
			const appender: CommittedTrackOutcomeAppender = {
				appendCommitted: async ({ outcomes }) => {
					appendAttempts += 1;
					batches.push([...outcomes]);
					if (appendAttempts === 1) {
						throw new TrackOutcomeBatchNotCommittedError({
							cause: new Error("broker unavailable"),
						});
					}
					const baseOffset = nextOffset;
					nextOffset += BigInt(outcomes.length);
					return { baseOffset };
				},
			};
			const writer = createPartitionTrackWriter({
				topic,
				partition,
				stateStore: fixture.store,
				appender,
				limits: defaultLimits,
			});

			const failed = await Promise.allSettled([
				writer.submitTrack({ command: createCommand({ commandId: "cmd_1" }) }),
				writer.submitTrack({ command: createCommand({ commandId: "cmd_2" }) }),
			]);

			expect(failed.every(({ status }) => status === "rejected")).toBe(true);
			for (const result of failed) {
				if (result.status === "rejected") {
					expect(result.reason).toBeInstanceOf(TrackOutcomeBatchAppendError);
				}
			}
			expect(
				readBalance({ store: fixture.store, identity: firstIdentity }),
			).toEqual({
				balance: 10,
				usage: 0,
				revision: 0,
			});

			await Promise.all([
				writer.submitTrack({ command: createCommand({ commandId: "cmd_1" }) }),
				writer.submitTrack({ command: createCommand({ commandId: "cmd_2" }) }),
			]);

			expect(batches.map((batch) => batch.length)).toEqual([2, 2]);
			expect(
				readBalance({ store: fixture.store, identity: firstIdentity }),
			).toEqual({
				balance: 0,
				usage: 10,
				revision: 2,
			});
		} finally {
			closeFixture(fixture);
		}
	});

	test("stops when an append failure could have committed", async () => {
		const fixture = createFixture();
		try {
			const appender: CommittedTrackOutcomeAppender = {
				appendCommitted: async () => {
					throw new Error("commit acknowledgement lost");
				},
			};
			const writer = createPartitionTrackWriter({
				topic,
				partition,
				stateStore: fixture.store,
				appender,
				limits: defaultLimits,
			});

			await expect(
				writer.submitTrack({ command: createCommand({ commandId: "cmd_1" }) }),
			).rejects.toBeInstanceOf(PartitionTrackWriterRecoveryRequiredError);
			await expect(
				writer.submitTrack({ command: createCommand({ commandId: "cmd_2" }) }),
			).rejects.toBeInstanceOf(PartitionTrackWriterRecoveryRequiredError);
			expect(
				readBalance({ store: fixture.store, identity: firstIdentity }),
			).toEqual({
				balance: 10,
				usage: 0,
				revision: 0,
			});
		} finally {
			closeFixture(fixture);
		}
	});

	test("stops when a committed appender returns an invalid offset", async () => {
		const fixture = createFixture();
		try {
			const appender: CommittedTrackOutcomeAppender = {
				appendCommitted: async () => ({ baseOffset: -1n }),
			};
			const writer = createPartitionTrackWriter({
				topic,
				partition,
				stateStore: fixture.store,
				appender,
				limits: defaultLimits,
			});

			await expect(
				writer.submitTrack({ command: createCommand({ commandId: "cmd_1" }) }),
			).rejects.toBeInstanceOf(PartitionTrackWriterRecoveryRequiredError);
			await expect(
				writer.submitTrack({ command: createCommand({ commandId: "cmd_2" }) }),
			).rejects.toBeInstanceOf(PartitionTrackWriterRecoveryRequiredError);
		} finally {
			closeFixture(fixture);
		}
	});

	test("splits queued outcomes at the configured batch size", async () => {
		const fixture = createFixture();
		try {
			const appender = new RecordingCommittedAppender();
			const writer = createPartitionTrackWriter({
				topic,
				partition,
				stateStore: fixture.store,
				appender,
				limits: { ...defaultLimits, maxBatchSize: 2 },
			});

			await Promise.all([
				writer.submitTrack({ command: createCommand({ commandId: "cmd_1" }) }),
				writer.submitTrack({ command: createCommand({ commandId: "cmd_2" }) }),
				writer.submitTrack({ command: createCommand({ commandId: "cmd_3" }) }),
			]);

			expect(appender.batches.map((batch) => batch.length)).toEqual([2, 1]);
		} finally {
			closeFixture(fixture);
		}
	});

	test("admits duplicate waiters while enforcing partition capacity", async () => {
		const fixture = createFixture({
			identities: [firstIdentity, secondIdentity],
		});
		try {
			const appender = new ControlledCommittedAppender();
			const writer = createPartitionTrackWriter({
				topic,
				partition,
				stateStore: fixture.store,
				appender,
				limits: {
					maxBatchSize: 10,
					maxPendingCommands: 1,
					maxPendingCommandsPerCustomer: 2,
				},
			});
			const command = createCommand({ commandId: "cmd_1" });
			const firstPromise = writer.submitTrack({ command });
			const duplicatePromise = writer.submitTrack({ command });

			await expect(
				writer.submitTrack({
					command: createCommand({
						commandId: "cmd_2",
						identity: secondIdentity,
					}),
				}),
			).rejects.toBeInstanceOf(PartitionTrackWriterCapacityError);

			await waitForBatch();
			appender.resolve();
			const [firstDecision, duplicateDecision] = await Promise.all([
				firstPromise,
				duplicatePromise,
			]);
			expect(firstDecision.kind).toBe("new");
			expect(duplicateDecision.kind).toBe("duplicate");
			expect(appender.batches[0]).toHaveLength(1);
		} finally {
			closeFixture(fixture);
		}
	});

	test("enforces customer capacity without blocking another customer", async () => {
		const fixture = createFixture({
			identities: [firstIdentity, secondIdentity],
		});
		try {
			const appender = new ControlledCommittedAppender();
			const writer = createPartitionTrackWriter({
				topic,
				partition,
				stateStore: fixture.store,
				appender,
				limits: {
					maxBatchSize: 10,
					maxPendingCommands: 2,
					maxPendingCommandsPerCustomer: 1,
				},
			});
			const firstCustomerPromise = writer.submitTrack({
				command: createCommand({ commandId: "cmd_a1" }),
			});

			await expect(
				writer.submitTrack({
					command: createCommand({ commandId: "cmd_a2" }),
				}),
			).rejects.toBeInstanceOf(PartitionTrackWriterCapacityError);
			const secondCustomerPromise = writer.submitTrack({
				command: createCommand({
					commandId: "cmd_b1",
					identity: secondIdentity,
				}),
			});

			await waitForBatch();
			appender.resolve();
			await Promise.all([firstCustomerPromise, secondCustomerPromise]);
			expect(appender.batches[0]?.map(({ commandId }) => commandId)).toEqual([
				"cmd_a1",
				"cmd_b1",
			]);
		} finally {
			closeFixture(fixture);
		}
	});

	test("stops after a committed batch cannot be applied locally", async () => {
		const fixture = createFixture();
		try {
			const appender = new RecordingCommittedAppender();
			const stateStore = {
				readState: fixture.store.readState.bind(fixture.store),
				readTrackReceipt: fixture.store.readTrackReceipt.bind(fixture.store),
				applyDurableTrackOutcomes: () => {
					throw new Error("disk write failed");
				},
			};
			const writer = createPartitionTrackWriter({
				topic,
				partition,
				stateStore,
				appender,
				limits: defaultLimits,
			});

			await expect(
				writer.submitTrack({ command: createCommand({ commandId: "cmd_1" }) }),
			).rejects.toBeInstanceOf(PartitionTrackWriterRecoveryRequiredError);
			await expect(
				writer.submitTrack({ command: createCommand({ commandId: "cmd_2" }) }),
			).rejects.toBeInstanceOf(PartitionTrackWriterRecoveryRequiredError);
			expect(
				readBalance({ store: fixture.store, identity: firstIdentity }),
			).toEqual({
				balance: 10,
				usage: 0,
				revision: 0,
			});
		} finally {
			closeFixture(fixture);
		}
	});

	test("returns unsupported commands without appending", async () => {
		const fixture = createFixture();
		try {
			const appender = new RecordingCommittedAppender();
			const writer = createPartitionTrackWriter({
				topic,
				partition,
				stateStore: fixture.store,
				appender,
				limits: defaultLimits,
			});

			const decision = await writer.submitTrack({
				command: createCommand({
					commandId: "cmd_1",
					properties: { region: "eu" },
				}),
			});

			expect(decision).toEqual({
				kind: "unsupported",
				reason: "properties_not_supported",
			});
			expect(appender.batches).toHaveLength(0);
		} finally {
			closeFixture(fixture);
		}
	});
});

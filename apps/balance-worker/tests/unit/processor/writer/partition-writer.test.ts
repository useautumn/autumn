import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	computeTrack,
	createCustomerMeteringState,
	executeTrack,
	type MeteringIdentity,
	meteringPartitionKeyOf,
	parseStateInitializedEvent,
	parseTrackCommand,
	type StateInitializedEvent,
	type TrackCommand,
	type TrackDecision,
	trackCommandFingerprintOf,
} from "@autumn/balance-engine";
import type { MeteringRecord } from "@autumn/kafka";
import {
	type InitializationDecision,
	initialize,
} from "../../../../src/processor/commands/initialize.js";
import {
	type TrackReceiptPolicy,
	track,
} from "../../../../src/processor/commands/track.js";
import { createAcceptedCommands } from "../../../../src/processor/common/acceptedCommands.js";
import type { PartitionProcessorScope } from "../../../../src/processor/types/partitionProcessor.js";
import { createPartitionWriter as createPartitionWriterCore } from "../../../../src/processor/writer/createPartitionWriter.js";
import type {
	MutateParams,
	MutationResult,
	MutationSubmission,
} from "../../../../src/processor/writer/types/mutation.js";
import type {
	CommittedOutcomeAppender,
	PartitionWriterContext,
	PartitionWriterLimits,
} from "../../../../src/processor/writer/types/partitionWriter.js";
import {
	MutationBatchAppendError,
	MutationBatchNotCommittedError,
	PartitionWriterCapacityError,
	PartitionWriterCommandConflictError,
	PartitionWriterRecoveryRequiredError,
	PartitionWriterStateNotFoundError,
} from "../../../../src/processor/writer/writerErrors.js";
import { ConflictingMeteringStateInitializationError } from "../../../../src/state/sqliteBalanceStateErrors.js";
import {
	openSqliteBalanceStateStore,
	type SqliteBalanceStateStore,
} from "../../../../src/state/sqliteBalanceStateStore.js";

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
				customerEntitlements: [
					{
						id: "messages_monthly",
						balance,
						usage: 0,
						granted: balance,
						externalId: null,
						planId: null,
						reset: null,
						expiresAt: null,
					},
				],
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

const createInitialization = ({
	identity,
	initializationId = `init_${identity.customerId}`,
	balance = 10,
}: {
	identity: MeteringIdentity;
	initializationId?: string;
	balance?: number;
}): StateInitializedEvent =>
	parseStateInitializedEvent({
		input: {
			schemaVersion: 1,
			type: "state_initialized",
			initializationId,
			initializedAt: 1_700_000_000_000,
			state: createState({ identity, balance }),
		},
	});

class RecordingCommittedAppender implements CommittedOutcomeAppender {
	readonly batches: MeteringRecord[][] = [];
	private nextOffset = 0n;

	async appendCommitted({
		outcomes,
	}: {
		topic: string;
		partition: number;
		outcomes: readonly MeteringRecord[];
	}): Promise<{ baseOffset: bigint }> {
		const baseOffset = this.nextOffset;
		this.batches.push([...outcomes]);
		this.nextOffset += BigInt(outcomes.length);
		return { baseOffset };
	}
}

class ControlledCommittedAppender implements CommittedOutcomeAppender {
	readonly batches: MeteringRecord[][] = [];
	private resolveAppend: ((result: { baseOffset: bigint }) => void) | null =
		null;

	appendCommitted({
		outcomes,
	}: {
		topic: string;
		partition: number;
		outcomes: readonly MeteringRecord[];
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
		store.restoreState({
			topic,
			partition,
			initializationId: `init_${identity.customerId}`,
			state: createState({ identity }),
		});
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

const batchKeys = (batch: MeteringRecord[] | undefined) =>
	batch?.map((mutation) =>
		mutation.type === "track_outcome"
			? mutation.commandId
			: mutation.initializationId,
	);

const waitForBatch = async (): Promise<void> => {
	await new Promise<void>((resolve) => setImmediate(resolve));
};

const defaultLimits = {
	maxBatchSize: 100,
	maxPendingCommands: 1_000,
	maxPendingCommandsPerCustomer: 100,
};

const defaultReceiptPolicy = {
	retentionMs: 86_400_000,
	now: () => 1_700_000_000_000,
};

type TestWriter = {
	submitTrack(params: { command: TrackCommand }): Promise<TrackDecision>;
	submitInitialization(params: {
		initialization: StateInitializedEvent;
	}): Promise<InitializationDecision>;
};

const createPartitionTrackWriter = ({
	topic,
	partition,
	stateStore,
	appender,
	limits,
	receiptPolicy = defaultReceiptPolicy,
}: {
	topic: string;
	partition: number;
	stateStore: PartitionWriterContext["stateStore"];
	appender: CommittedOutcomeAppender;
	limits: PartitionWriterLimits;
	receiptPolicy?: TrackReceiptPolicy;
}): TestWriter => {
	const writer = createPartitionWriterCore({
		ctx: { stateStore, appender },
		config: { topic, partition, limits },
	});
	const scope: PartitionProcessorScope = {
		ctx: {
			stateStore,
			appender,
			trackReceiptPolicy: receiptPolicy,
			assertCanRead: () => undefined,
			config: { topic, partition, writerLimits: limits },
			writer,
		},
		accepted: createAcceptedCommands(),
	};
	return {
		submitTrack: ({ command }) => track({ scope, command }),
		submitInitialization: ({ initialization }) =>
			initialize({
				writer,
				command: {
					schemaVersion: 1,
					type: "initialize",
					requestId: initialization.initializationId,
					identity: initialization.state.identity,
					initializationId: initialization.initializationId,
					state: initialization.state,
					occurredAt: initialization.initializedAt,
				},
			}),
	};
};

function decideForTest({
	state,
	command,
}: MutateParams & { command: TrackCommand }): MutationResult<TrackDecision> {
	const decision = computeTrack({
		state,
		command,
		deduplicationExpiresAt: 1_700_086_400_000,
	});
	if (decision.kind !== "new") return { kind: "reply", reply: decision };
	const { state: nextState } = executeTrack({
		state,
		outcome: decision.outcome,
	});
	return { kind: "write", outcome: decision.outcome, nextState };
}

describe("partition writer", () => {
	test("stamps receipt expiry from worker policy", async () => {
		const fixture = createFixture();
		try {
			const appender = new RecordingCommittedAppender();
			const writer = createPartitionTrackWriter({
				topic,
				partition,
				stateStore: fixture.store,
				appender,
				limits: defaultLimits,
				receiptPolicy: defaultReceiptPolicy,
			});

			const decision = await writer.submitTrack({
				command: createCommand({ commandId: "cmd_1" }),
			});

			expect(decision).toMatchObject({
				kind: "new",
				outcome: { deduplicationExpiresAt: 1_700_086_400_000 },
			});
			expect(appender.batches[0]?.[0]).toMatchObject({
				deduplicationExpiresAt: 1_700_086_400_000,
			});
		} finally {
			closeFixture(fixture);
		}
	});

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
			expect(batchKeys(appender.batches[0])).toEqual([
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

			expect(batchKeys(appender.batches[0])).toEqual([
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
			if (!outcome || outcome.type !== "track_outcome")
				throw new Error("Expected an appended track outcome");
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

			const [firstDecision, retryDecision, conflict] = await Promise.allSettled(
				[
					writer.submitTrack({ command }),
					writer.submitTrack({
						command: { ...command, requestId: "req_retry" },
					}),
					writer.submitTrack({ command: { ...command, value: 6 } }),
				],
			);

			if (firstDecision.status !== "fulfilled") throw firstDecision.reason;
			if (retryDecision.status !== "fulfilled") throw retryDecision.reason;
			expect(firstDecision.value.kind).toBe("new");
			expect(retryDecision.value).toMatchObject({
				kind: "duplicate",
				outcome:
					firstDecision.value.kind === "new"
						? firstDecision.value.outcome
						: undefined,
			});
			expect(conflict.status).toBe("rejected");
			if (conflict.status === "rejected") {
				expect(conflict.reason).toBeInstanceOf(
					PartitionWriterCommandConflictError,
				);
			}
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
			const batches: MeteringRecord[][] = [];
			const appender: CommittedOutcomeAppender = {
				appendCommitted: async ({ outcomes }) => {
					appendAttempts += 1;
					batches.push([...outcomes]);
					if (appendAttempts === 1) {
						throw new MutationBatchNotCommittedError({
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
					expect(result.reason).toBeInstanceOf(MutationBatchAppendError);
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
			const appender: CommittedOutcomeAppender = {
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
			).rejects.toBeInstanceOf(PartitionWriterRecoveryRequiredError);
			await expect(
				writer.submitTrack({ command: createCommand({ commandId: "cmd_2" }) }),
			).rejects.toBeInstanceOf(PartitionWriterRecoveryRequiredError);
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
			const appender: CommittedOutcomeAppender = {
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
			).rejects.toBeInstanceOf(PartitionWriterRecoveryRequiredError);
			await expect(
				writer.submitTrack({ command: createCommand({ commandId: "cmd_2" }) }),
			).rejects.toBeInstanceOf(PartitionWriterRecoveryRequiredError);
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
			).rejects.toBeInstanceOf(PartitionWriterCapacityError);

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
			).rejects.toBeInstanceOf(PartitionWriterCapacityError);
			const secondCustomerPromise = writer.submitTrack({
				command: createCommand({
					commandId: "cmd_b1",
					identity: secondIdentity,
				}),
			});

			await waitForBatch();
			appender.resolve();
			await Promise.all([firstCustomerPromise, secondCustomerPromise]);
			expect(batchKeys(appender.batches[0])).toEqual(["cmd_a1", "cmd_b1"]);
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
				readInitializationReceipt: fixture.store.readInitializationReceipt.bind(
					fixture.store,
				),
				readTrackReceipt: fixture.store.readTrackReceipt.bind(fixture.store),
				applyDurableMutations: () => {
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
			).rejects.toBeInstanceOf(PartitionWriterRecoveryRequiredError);
			await expect(
				writer.submitTrack({ command: createCommand({ commandId: "cmd_2" }) }),
			).rejects.toBeInstanceOf(PartitionWriterRecoveryRequiredError);
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

	test("rejects a track for a customer with no state without appending", async () => {
		const fixture = createFixture({ identities: [] });
		try {
			const appender = new RecordingCommittedAppender();
			const writer = createPartitionTrackWriter({
				topic,
				partition,
				stateStore: fixture.store,
				appender,
				limits: defaultLimits,
			});

			await expect(
				writer.submitTrack({ command: createCommand({ commandId: "cmd_1" }) }),
			).rejects.toBeInstanceOf(PartitionWriterStateNotFoundError);
			expect(appender.batches).toHaveLength(0);
		} finally {
			closeFixture(fixture);
		}
	});

	test("commits an initialization then serves tracks against it in one batch", async () => {
		const fixture = createFixture({ identities: [] });
		try {
			const appender = new RecordingCommittedAppender();
			const writer = createPartitionTrackWriter({
				topic,
				partition,
				stateStore: fixture.store,
				appender,
				limits: defaultLimits,
			});

			const [initialized, tracked] = await Promise.all([
				writer.submitInitialization({
					initialization: createInitialization({ identity: firstIdentity }),
				}),
				writer.submitTrack({ command: createCommand({ commandId: "cmd_1" }) }),
			]);

			expect(initialized).toMatchObject({ kind: "initialized" });
			expect(tracked).toMatchObject({
				kind: "new",
				outcome: { status: "applied", balanceBefore: 10, balanceAfter: 5 },
			});
			expect(appender.batches).toHaveLength(1);
			expect(batchKeys(appender.batches[0])).toEqual(["init_cus_1", "cmd_1"]);
			expect(
				readBalance({ store: fixture.store, identity: firstIdentity }),
			).toEqual({ balance: 5, usage: 5, revision: 1 });
			expect(fixture.store.readNextOffset({ topic, partition })).toBe(2n);
		} finally {
			closeFixture(fixture);
		}
	});

	test.concurrent(
		"committed initialization retry returns duplicate without resetting later usage",
		async () => {
			const fixture = createFixture({ identities: [] });
			try {
				const appender = new RecordingCommittedAppender();
				const writerOptions = {
					topic,
					partition,
					stateStore: fixture.store,
					appender,
					limits: defaultLimits,
				};
				const writer = createPartitionTrackWriter(writerOptions);
				const initialization = createInitialization({
					identity: firstIdentity,
				});
				await writer.submitInitialization({ initialization });
				await writer.submitTrack({
					command: createCommand({ commandId: "after_initialization" }),
				});

				const replacementWriter = createPartitionTrackWriter(writerOptions);
				const decision = await replacementWriter.submitInitialization({
					initialization: {
						...initialization,
						initializedAt: initialization.initializedAt + 1_000,
					},
				});

				expect(decision).toEqual({
					kind: "duplicate",
					state: initialization.state,
				});
				expect(appender.batches).toHaveLength(2);
				expect(fixture.store.readNextOffset({ topic, partition })).toBe(2n);
				expect(
					readBalance({ store: fixture.store, identity: firstIdentity }),
				).toEqual({ balance: 5, usage: 5, revision: 1 });
			} finally {
				closeFixture(fixture);
			}
		},
	);

	test.concurrent(
		"committed initialization identity rejects a different baseline without changing state",
		async () => {
			const fixture = createFixture({ identities: [] });
			try {
				const appender = new RecordingCommittedAppender();
				const writer = createPartitionTrackWriter({
					topic,
					partition,
					stateStore: fixture.store,
					appender,
					limits: defaultLimits,
				});
				await writer.submitInitialization({
					initialization: createInitialization({ identity: firstIdentity }),
				});
				await writer.submitTrack({
					command: createCommand({ commandId: "before_conflict" }),
				});

				await expect(
					writer.submitInitialization({
						initialization: createInitialization({
							identity: firstIdentity,
							balance: 99,
						}),
					}),
				).rejects.toBeInstanceOf(ConflictingMeteringStateInitializationError);

				expect(appender.batches).toHaveLength(2);
				expect(fixture.store.readNextOffset({ topic, partition })).toBe(2n);
				expect(
					readBalance({ store: fixture.store, identity: firstIdentity }),
				).toEqual({ balance: 5, usage: 5, revision: 1 });
				await expect(
					writer.submitTrack({
						command: createCommand({ commandId: "after_conflict", value: 1 }),
					}),
				).resolves.toMatchObject({
					kind: "new",
					outcome: { balanceAfter: 4, revisionAfter: 2 },
				});
			} finally {
				closeFixture(fixture);
			}
		},
	);

	test("replies already_initialized for a customer that has state", async () => {
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

			const decision = await writer.submitInitialization({
				initialization: createInitialization({
					identity: firstIdentity,
					initializationId: "init_other",
					balance: 99,
				}),
			});

			expect(decision).toEqual({ kind: "already_initialized" });
			expect(appender.batches).toHaveLength(0);
			expect(
				readBalance({ store: fixture.store, identity: firstIdentity }),
			).toEqual({ balance: 10, usage: 0, revision: 0 });
		} finally {
			closeFixture(fixture);
		}
	});

	test("coalesces a concurrent identical initialization; a differing one sees the pending baseline", async () => {
		const fixture = createFixture({ identities: [] });
		try {
			const appender = new RecordingCommittedAppender();
			const writer = createPartitionTrackWriter({
				topic,
				partition,
				stateStore: fixture.store,
				appender,
				limits: defaultLimits,
			});
			const initialization = createInitialization({ identity: firstIdentity });

			const [first, duplicate, competing, conflict] = await Promise.allSettled([
				writer.submitInitialization({ initialization }),
				writer.submitInitialization({ initialization }),
				writer.submitInitialization({
					initialization: createInitialization({
						identity: firstIdentity,
						initializationId: "init_other",
						balance: 99,
					}),
				}),
				writer.submitInitialization({
					initialization: createInitialization({
						identity: firstIdentity,
						balance: 99,
					}),
				}),
			]);

			expect(first).toMatchObject({
				status: "fulfilled",
				value: { kind: "initialized" },
			});
			expect(duplicate).toMatchObject({
				status: "fulfilled",
				value: { kind: "duplicate" },
			});
			// The pending projection already exists, so a competing baseline never appends.
			expect(competing).toMatchObject({
				status: "fulfilled",
				value: { kind: "already_initialized" },
			});
			// Same initializationId with a different baseline is a caller bug.
			expect(conflict).toMatchObject({
				status: "rejected",
				reason: expect.any(ConflictingMeteringStateInitializationError),
			});
			expect(appender.batches).toHaveLength(1);
			expect(appender.batches[0]).toHaveLength(1);
			expect(
				readBalance({ store: fixture.store, identity: firstIdentity }),
			).toEqual({ balance: 10, usage: 0, revision: 0 });
		} finally {
			closeFixture(fixture);
		}
	});

	test("still resolves initialized when the consumer applies the initialization first", async () => {
		const fixture = createFixture({ identities: [] });
		try {
			const appender = new ControlledCommittedAppender();
			const writer = createPartitionTrackWriter({
				topic,
				partition,
				stateStore: fixture.store,
				appender,
				limits: defaultLimits,
			});
			const initialization = createInitialization({ identity: firstIdentity });
			const decisionPromise = writer.submitInitialization({ initialization });

			await waitForBatch();
			expect(
				fixture.store.applyDurableStateInitialization({
					position: { topic, partition, offset: 0n },
					initialization,
				}),
			).toMatchObject({ kind: "initialized", nextOffset: 1n });

			appender.resolve();
			// The submitter wrote it; who applied the position first does not change that.
			await expect(decisionPromise).resolves.toMatchObject({
				kind: "initialized",
				state: { revision: 0 },
			});
			expect(fixture.store.readNextOffset({ topic, partition })).toBe(1n);
		} finally {
			closeFixture(fixture);
		}
	});
	test("waitForPendingCommits snapshots what is pending at call time", async () => {
		const fixture = createFixture();
		try {
			const appender = new ControlledCommittedAppender();
			const writer = createPartitionWriterCore({
				ctx: { stateStore: fixture.store, appender },
				config: { topic, partition, limits: defaultLimits },
			});
			const customerKey = meteringPartitionKeyOf({ identity: firstIdentity });
			const submission = (
				commandId: string,
			): MutationSubmission<TrackDecision> => {
				const command = createCommand({ commandId });
				return {
					identity: command.identity,
					commandId,
					fingerprint: trackCommandFingerprintOf({ command }),
					mutate: ({ state }) => decideForTest({ state, command }),
				};
			};

			const first = writer.decide(submission("cmd_1"));
			let settledResolved = false;
			const settled = writer.waitForPendingCommits({ customerKey }).then(() => {
				settledResolved = true;
			});
			await waitForBatch();
			// Enqueued after the wait began: must not extend it.
			const second = writer.decide(submission("cmd_2"));

			expect(settledResolved).toBe(false);
			appender.resolve({ baseOffset: 0n });
			await first.waitForCommit();
			await settled;
			expect(settledResolved).toBe(true);

			await waitForBatch();
			appender.resolve({ baseOffset: 1n });
			await second.waitForCommit();
			await expect(
				writer.waitForPendingCommits({ customerKey }),
			).resolves.toBeUndefined();
		} finally {
			closeFixture(fixture);
		}
	});
});

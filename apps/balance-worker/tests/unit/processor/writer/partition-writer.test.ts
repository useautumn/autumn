import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	applyMutation,
	computeTrack,
	createSubjectState,
	type InitializeRequest,
	type MeteringIdentity,
	meteringIdentityToPartitionKey,
	parseTrackCommand,
	type SubjectState,
	type TrackCommand,
	UnsupportedCommandError,
} from "@autumn/balance-engine";
import type {
	InitializeReply,
	TrackReply,
} from "@autumn/balance-worker-client/protocol";
import type { MeteringRecord } from "@autumn/kafka";
import { initialize } from "../../../../src/processor/commands/initialize.js";
import { track } from "../../../../src/processor/commands/track.js";
import { createAcceptedCommands } from "../../../../src/processor/common/acceptedCommands.js";
import { createPartitionProcessor } from "../../../../src/processor/createPartitionProcessor.js";
import { completeCommand } from "../../../../src/processor/execution/completeCommand.js";
import { executeCommand } from "../../../../src/processor/execution/executeCommand.js";
import { createSubjectHydrator } from "../../../../src/processor/subject/createSubjectHydrator.js";
import { SubjectNotFoundError } from "../../../../src/processor/subject/subjectErrors.js";
import type { PartitionProcessorScope } from "../../../../src/processor/types/partitionProcessor.js";
import type { ReceiptPolicy } from "../../../../src/processor/types/receiptPolicy.js";
import { createPartitionWriter as createPartitionWriterCore } from "../../../../src/processor/writer/createPartitionWriter.js";
import { createRecentCommands } from "../../../../src/processor/writer/recentCommands/createRecentCommands.js";
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
} from "../../../../src/processor/writer/writerErrors.js";
import { openStateStore } from "../../../../src/state/openStateStore.js";
import type { SqliteStateStore } from "../../../../src/state/types/stateStore.js";
import {
	createSyntheticWorkerDb,
	createTestCatalogCache,
} from "../../../fixtures/catalog.js";
import {
	applyDurableMutation,
	createCustomerEntitlement,
	createInitializeRequest,
	createSubjectFor,
	restoreSubjectStates,
	testOrg,
} from "../../../fixtures/mutations.js";

const topic = "metering-events-v1";
const partition = 0;
const firstIdentity = {
	orgId: "org_1",
	env: "sandbox",
	customerId: "cus_1",
	entityId: null,
} as const;
const secondIdentity = { ...firstIdentity, customerId: "cus_2" } as const;

const createState = ({
	identity,
	balance = 10,
}: {
	identity: MeteringIdentity;
	balance?: number;
}): SubjectState =>
	createSubjectState({
		identity,
		customerEntitlements: [
			createCustomerEntitlement({
				id: "messages_monthly",
				featureId: "messages",
				balance,
			}),
		],
	});

const createCommand = ({
	commandId,
	identity = firstIdentity,
	featureId = "messages",
	value = 5,
	properties = null,
}: {
	commandId: string;
	identity?: MeteringIdentity;
	featureId?: string;
	value?: number;
	properties?: Record<string, string> | null;
}): TrackCommand =>
	parseTrackCommand({
		input: {
			schemaVersion: 1,
			type: "track",
			org: testOrg,
			commandId,
			requestId: `req_${commandId}`,
			identity,
			featureId,
			internalFeatureId: `feat_${featureId}`,
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
	store: SqliteStateStore;
	identity: MeteringIdentity;
}) => {
	const state = store.readState({ identity });
	if (!state) throw new Error("Expected persisted metering state");
	return {
		balance: state.customerEntitlements.find(
			(row) => row.id === "messages_monthly",
		)?.balance,
		revision: state.revision,
	};
};

const createInitialization = ({
	identity,
	commandId = `init_${identity.customerId}`,
	balance = 10,
}: {
	identity: MeteringIdentity;
	commandId?: string;
	balance?: number;
}): InitializeRequest =>
	createInitializeRequest({
		state: createState({ identity, balance }),
		commandId,
		requestId: commandId,
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
	store: SqliteStateStore;
} => {
	const directory = mkdtempSync(join(tmpdir(), "autumn-partition-writer-"));
	const store = openStateStore({
		databasePath: join(directory, "balance-state.sqlite"),
	});
	store.initializePartition({ topic, partition, nextOffset: 0n });
	if (identities.length > 0) {
		restoreSubjectStates({
			store,
			topic,
			partition,
			states: identities.map((identity) => createState({ identity })),
		});
	}
	return { directory, store };
};

const closeFixture = ({
	directory,
	store,
}: {
	directory: string;
	store: SqliteStateStore;
}) => {
	store.close();
	rmSync(directory, { recursive: true, force: true });
};

const batchKeys = (batch: MeteringRecord[] | undefined) =>
	batch?.map((mutation) => mutation.id);

/** Two turns: a command resolves its subject before it reaches the writer, and the writer commits on the turn after. */
const waitForBatch = async (): Promise<void> => {
	await new Promise<void>((resolve) => setImmediate(resolve));
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
	completeCommand(params: { source: { commandOffset: string } }): Promise<void>;
	submitTrack(params: {
		command: TrackCommand;
		source?: { commandOffset: string };
	}): Promise<TrackReply>;
	submitInitialization(params: {
		initialization: InitializeRequest;
	}): Promise<InitializeReply>;
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
	stateStore: PartitionProcessorScope["ctx"]["stateStore"];
	appender: CommittedOutcomeAppender;
	limits: PartitionWriterLimits;
	receiptPolicy?: ReceiptPolicy;
}): TestWriter => {
	const recentCommands = createRecentCommands({
		windowMs: 600_000,
		now: () => 0,
	});
	const writer = createPartitionWriterCore({
		ctx: { stateStore, appender, receiptPolicy, recentCommands },
		config: { topic, partition, limits },
	});
	const db = createSyntheticWorkerDb();
	const catalogCache = createTestCatalogCache();
	const scope: PartitionProcessorScope = {
		ctx: {
			stateStore,
			appender,
			db,
			catalogCache,
			receiptPolicy: receiptPolicy,
			recentCommands,
			assertCanRead: () => undefined,
			config: { topic, partition, writerLimits: limits },
			writer,
			subjectHydrator: createSubjectHydrator({
				ctx: {
					catalogCache,
					db,
					writer,
					receiptPolicy,
				},
			}),
		},
		accepted: createAcceptedCommands(),
	};
	return {
		completeCommand: ({ source }) => completeCommand({ scope, source }),
		submitTrack: ({ command, source }) =>
			source
				? executeCommand({
						scope,
						source,
						run: (scope) => track({ scope, command }),
					})
				: track({ scope, command }),
		submitInitialization: ({ initialization }) =>
			initialize({ scope, request: initialization }),
	};
};

function decideForTest({
	state,
	command,
}: MutateParams & { command: TrackCommand }): MutationResult<never> {
	if (!state) throw new Error("Expected projected state");
	const mutation = computeTrack({
		fullSubject: createSubjectFor({ state }),
		command,
	});
	return {
		kind: "write",
		mutation,
		nextState: applyMutation({ state, mutation }),
	};
}

describe("partition writer", () => {
	test("queued execution stamps only its own mutation while concurrent HTTP tracks share the writer", async () => {
		const fixture = createFixture();
		const gate = Promise.withResolvers<void>();
		let applied = false;
		try {
			const appender = new RecordingCommittedAppender();
			const processor = createPartitionProcessor({
				ctx: {
					stateStore: {
						...fixture.store,
						applyDurableMutations: async (params) => {
							await gate.promise;
							const result = fixture.store.applyDurableMutations(params);
							applied = true;
							return result;
						},
					},
					appender,
					db: createSyntheticWorkerDb(),
					catalogCache: createTestCatalogCache(),
					receiptPolicy: defaultReceiptPolicy,
					recentCommands: createRecentCommands({
						windowMs: 600_000,
						now: () => 0,
					}),
					assertCanRead: () => {},
				},
				config: { topic, partition, writerLimits: defaultLimits },
			});
			const queued = processor.execute({
				source: { commandOffset: "41" },
				run: (processor) =>
					processor.track({ command: createCommand({ commandId: "queued" }) }),
			});
			const http = processor.track({
				command: createCommand({ commandId: "http" }),
			});
			const replies = await Promise.all([queued, http]);
			expect(applied).toBe(false);
			expect(
				replies.map((reply) => reply.state.customerEntitlements[0]?.balance),
			).toEqual([5, 0]);
			expect(
				appender.batches
					.flat()
					.map((record) => ({ id: record.id, source: record.source })),
			).toEqual([
				{ id: "queued", source: { commandOffset: "41" } },
				{ id: "http", source: undefined },
			]);
			gate.resolve();
			await waitForBatch();
			expect(applied).toBe(true);
		} finally {
			gate.resolve();
			await waitForBatch();
			closeFixture(fixture);
		}
	});

	test("command completion waits for a log-acknowledged write to reach the store, then fences before bookmarking", async () => {
		const fixture = createFixture();
		const gate = Promise.withResolvers<void>();
		const events: string[] = [];
		try {
			const appender = new RecordingCommittedAppender();
			const writer = createPartitionTrackWriter({
				topic,
				partition,
				limits: defaultLimits,
				appender: {
					appendCommitted: (params) => appender.appendCommitted(params),
					commitCommandOffset: async () => {
						events.push("fenced");
					},
				},
				stateStore: {
					...fixture.store,
					applyDurableMutations: async (params) => {
						await gate.promise;
						const result = fixture.store.applyDurableMutations(params);
						events.push("applied");
						return result;
					},
					advanceCommandNextOffset: ({ commandNextOffset }) => {
						events.push(`bookmark:${commandNextOffset}`);
					},
				},
			});
			const command = createCommand({ commandId: "http_in_flight" });
			const sent = writer.submitTrack({ command });
			const completion = writer.submitTrack({
				command,
				source: { commandOffset: "41" },
			});
			await sent;
			await waitForBatch();
			expect(events).toEqual([]);
			gate.resolve();
			await completion;
			expect(events).toEqual(["applied", "fenced", "bookmark:42"]);
		} finally {
			gate.resolve();
			closeFixture(fixture);
		}
	});

	test("a failed command offset transaction never advances the Postgres bookmark", async () => {
		const fixture = createFixture();
		const bookmarks: bigint[] = [];
		try {
			const appender = new RecordingCommittedAppender();
			const writer = createPartitionTrackWriter({
				topic,
				partition,
				limits: defaultLimits,
				appender: {
					appendCommitted: (params) => appender.appendCommitted(params),
					commitCommandOffset: async () => {
						throw new Error("producer fenced");
					},
				},
				stateStore: {
					...fixture.store,
					advanceCommandNextOffset: ({ commandNextOffset }) => {
						bookmarks.push(commandNextOffset);
					},
				},
			});
			await expect(
				writer.completeCommand({ source: { commandOffset: "41" } }),
			).rejects.toThrow("producer fenced");
			expect(bookmarks).toEqual([]);
		} finally {
			closeFixture(fixture);
		}
	});

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

			expect(decision).toMatchObject({ state: { revision: 1 } });
			expect(appender.batches[0]?.[0]).toMatchObject({
				receipt: { expiresAt: 1_700_086_400_000 },
			});
		} finally {
			closeFixture(fixture);
		}
	});

	/** The log is the record; Postgres is a projection of it. Once Kafka has the
	 *  batch the outcome is durable, so the caller can be answered then instead of
	 *  waiting out a store apply that adds nothing to the reply. The balance the
	 *  caller reads was computed at decide time, and the apply echoes back the very
	 *  mutation it was handed, so nothing in the response comes from the store. */
	test("settles the caller once Kafka has the batch, without waiting for the store", async () => {
		const fixture = createFixture();
		try {
			const appender = new RecordingCommittedAppender();
			let releaseApply: () => void = () => undefined;
			const applyGate = new Promise<void>((resolve) => {
				releaseApply = resolve;
			});
			const slowStore: PartitionProcessorScope["ctx"]["stateStore"] = {
				...fixture.store,
				applyDurableMutations: async ({ records }) => {
					await applyGate;
					return records.map((record) => ({
						kind: "applied" as const,
						mutation: record.mutation,
						nextOffset: record.position.offset + 1n,
					}));
				},
			};
			const writer = createPartitionTrackWriter({
				topic,
				partition,
				stateStore: slowStore,
				appender,
				limits: defaultLimits,
			});

			const decision = await writer.submitTrack({
				command: createCommand({ commandId: "cmd_before_apply" }),
			});

			expect(decision).toMatchObject({ state: { revision: 1 } });
			expect(appender.batches.length).toBe(1);
			releaseApply();
		} finally {
			closeFixture(fixture);
		}
	});

	/** The Postgres-backed store answers null to every read on purpose: Postgres
	 *  holds the baseline, so there is no receipt table to consult. A position
	 *  the committer has already durably applied must therefore be accepted on
	 *  the pending mutation alone, or the first re-applied record takes the
	 *  partition terminal and, through the partition service, the whole worker. */
	test("accepts an already-applied position on a store that keeps no receipts", async () => {
		const fixture = createFixture();
		try {
			const appender = new RecordingCommittedAppender();
			const mapBackedStore: PartitionProcessorScope["ctx"]["stateStore"] = {
				...fixture.store,
				baseline: "map",
				readReceipt: () => null,
				applyDurableMutations: ({ records }) =>
					records.map(() => ({
						kind: "position_already_applied" as const,
						nextOffset: 0n,
					})),
			};
			const writer = createPartitionTrackWriter({
				topic,
				partition,
				stateStore: mapBackedStore,
				appender,
				limits: defaultLimits,
			});

			const decision = await writer.submitTrack({
				command: createCommand({ commandId: "cmd_replayed" }),
			});

			expect(decision).toMatchObject({ state: { revision: 1 } });
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

			expect(decisions.map((decision) => decision.result.status)).toEqual([
				"applied",
				"applied",
				"rejected",
			]);
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
				revision: 2,
			});
			expect(
				readBalance({ store: fixture.store, identity: secondIdentity }),
			).toEqual({
				balance: 5,
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
				revision: 0,
			});

			appender.resolve();
			await decisionPromise;

			expect(settled).toBe(true);
			expect(
				readBalance({ store: fixture.store, identity: firstIdentity }),
			).toEqual({
				balance: 5,
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
			const mutation = appender.batches[0]?.[0];
			if (!mutation) throw new Error("Expected an appended mutation");
			expect(
				applyDurableMutation({
					store: fixture.store,
					topic,
					partition,
					offset: 0n,
					mutation,
				}),
			).toMatchObject({ kind: "applied", nextOffset: 1n });

			appender.resolve();
			await expect(decisionPromise).resolves.toMatchObject({
				result: { type: "track" },
				state: { revision: mutation.revision.after },
			});
			expect(
				readBalance({ store: fixture.store, identity: firstIdentity }),
			).toEqual({
				balance: 5,
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
				id: "cmd_2",
				result: { status: "rejected" },
			});
			appender.resolve({ baseOffset: 1n });

			const decisions = await Promise.all([firstPromise, secondPromise]);
			expect(decisions.map((decision) => decision.result.status)).toEqual([
				"applied",
				"rejected",
			]);
			expect(
				readBalance({ store: fixture.store, identity: firstIdentity }),
			).toEqual({
				balance: 4,
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
			expect(retryDecision.value).toEqual(firstDecision.value);
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
			expect(duplicateDecision).toEqual(firstDecision);
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

	/** Kafka took the batch, so the first caller already has its answer and keeps
	 *  it; the store refusing afterwards is the partition's problem, not that
	 *  caller's. Everything queued behind it still meets recovery. */
	test("stops after a committed batch cannot be applied locally", async () => {
		const fixture = createFixture();
		try {
			const appender = new RecordingCommittedAppender();
			const stateStore = {
				baseline: "log" as const,
				readCommandNextOffset: fixture.store.readCommandNextOffset,
				advanceCommandNextOffset: fixture.store.advanceCommandNextOffset,
				readState: fixture.store.readState.bind(fixture.store),
				readOwnState: fixture.store.readOwnState.bind(fixture.store),
				readReceipt: fixture.store.readReceipt.bind(fixture.store),
				applyDurableMutations: (): never => {
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

			const answered = await writer.submitTrack({
				command: createCommand({ commandId: "cmd_1" }),
			});
			expect(answered).toMatchObject({ state: { revision: 1 } });
			await expect(
				writer.submitTrack({ command: createCommand({ commandId: "cmd_2" }) }),
			).rejects.toBeInstanceOf(PartitionWriterRecoveryRequiredError);
			expect(
				readBalance({ store: fixture.store, identity: firstIdentity }),
			).toEqual({
				balance: 10,
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

			await expect(
				writer.submitTrack({
					command: createCommand({ commandId: "cmd_1", featureId: "unknown" }),
				}),
			).rejects.toEqual(
				new UnsupportedCommandError({ reason: "feature_not_found" }),
			);
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
			).rejects.toBeInstanceOf(SubjectNotFoundError);
			expect(appender.batches).toHaveLength(0);
		} finally {
			closeFixture(fixture);
		}
	});

	test("commits an initialization and serves a concurrent track against its pending baseline", async () => {
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

			expect(initialized).toMatchObject({
				result: { status: "initialized", duplicate: false },
			});
			expect(tracked.result).toMatchObject({
				status: "applied",
				deltas: [{ id: "messages_monthly", valueDelta: -5 }],
			});
			expect(
				appender.batches.flatMap((batch) => batchKeys(batch) ?? []),
			).toEqual(["init_cus_1", "cmd_1"]);
			expect(
				readBalance({ store: fixture.store, identity: firstIdentity }),
			).toEqual({ balance: 5, revision: 2 });
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
					db: createSyntheticWorkerDb(),
					catalogCache: createTestCatalogCache(),
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
						command: {
							...initialization.command,
							occurredAt: initialization.command.occurredAt + 1_000,
						},
					},
				});

				expect(decision).toMatchObject({
					result: { status: "initialized", duplicate: true },
					state: { revision: 2 },
				});
				expect(appender.batches).toHaveLength(2);
				expect(fixture.store.readNextOffset({ topic, partition })).toBe(2n);
				expect(
					readBalance({ store: fixture.store, identity: firstIdentity }),
				).toEqual({ balance: 5, revision: 2 });
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
				).rejects.toBeInstanceOf(PartitionWriterCommandConflictError);

				expect(appender.batches).toHaveLength(2);
				expect(fixture.store.readNextOffset({ topic, partition })).toBe(2n);
				expect(
					readBalance({ store: fixture.store, identity: firstIdentity }),
				).toEqual({ balance: 5, revision: 2 });
				await expect(
					writer.submitTrack({
						command: createCommand({ commandId: "after_conflict", value: 1 }),
					}),
				).resolves.toMatchObject({
					result: { status: "applied" },
					state: { revision: 3, customerEntitlements: [{ balance: 4 }] },
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
					commandId: "init_other",
					balance: 99,
				}),
			});

			expect(decision).toMatchObject({
				result: { status: "already_initialized", duplicate: false },
				state: { revision: 0 },
			});
			expect(appender.batches).toHaveLength(0);
			expect(
				readBalance({ store: fixture.store, identity: firstIdentity }),
			).toEqual({ balance: 10, revision: 0 });
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
						commandId: "init_other",
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
				value: { result: { status: "initialized", duplicate: false } },
			});
			expect(duplicate).toMatchObject({
				status: "fulfilled",
				value: { result: { status: "initialized", duplicate: true } },
			});
			// The pending projection already exists, so a competing baseline never appends.
			expect(competing).toMatchObject({
				status: "fulfilled",
				value: { result: { status: "already_initialized" } },
			});
			// Same commandId with a different baseline is a caller bug.
			expect(conflict).toMatchObject({
				status: "rejected",
				reason: expect.any(PartitionWriterCommandConflictError),
			});
			expect(appender.batches).toHaveLength(1);
			expect(appender.batches[0]).toHaveLength(1);
			expect(
				readBalance({ store: fixture.store, identity: firstIdentity }),
			).toEqual({ balance: 10, revision: 1 });
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
			const appended = appender.batches[0]?.[0];
			if (!appended) throw new Error("Expected an appended mutation");
			expect(
				applyDurableMutation({
					store: fixture.store,
					topic,
					partition,
					offset: 0n,
					mutation: appended,
				}),
			).toMatchObject({ kind: "applied", nextOffset: 1n });

			appender.resolve();
			// The submitter wrote it; who applied the position first does not change that.
			await expect(decisionPromise).resolves.toMatchObject({
				result: { status: "initialized" },
				state: { revision: 1 },
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
				ctx: {
					stateStore: fixture.store,
					appender,
					receiptPolicy: defaultReceiptPolicy,
					recentCommands: createRecentCommands({
						windowMs: 600_000,
						now: () => 0,
					}),
				},
				config: { topic, partition, limits: defaultLimits },
			});
			const customerKey = meteringIdentityToPartitionKey({
				identity: firstIdentity,
			});
			const submission = (commandId: string): MutationSubmission<never> => {
				const command = createCommand({ commandId });
				return {
					command,
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

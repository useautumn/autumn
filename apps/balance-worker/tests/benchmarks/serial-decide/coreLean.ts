/**
 * Core B: the critical section alone. One track = read the resident state → dedup → `mutateTrack` (the
 * real engine decision, unchanged) → record bytes → project the next state → reply bytes. No promise,
 * settlement or queue per command: a record gets a sequence number, the Kafka worker owns the commit,
 * and the ack finishes the bookkeeping (dedup window, pins) for a whole range at once.
 *
 * Same fixtures as the baseline (`createSpikeWorker`): one hot customer, `typical` catalog, prod limits.
 * The sequencer cuts are switchable through DIET (see below) so one build measures each of them;
 * SPIKE_DEDUP_WINDOW_MS shrinks the dedup window to see what the window's memory costs the thread.
 */
import {
	type Catalog,
	type CheckCommand,
	type MutationEffect,
	type MutationRecord,
	meteringIdentityToPartitionKey,
	meteringIdentityToSubjectKey,
	type SubjectState,
	splitSubjectState,
	type TrackCommand,
} from "@autumn/balance-engine";
import type {
	CheckReply,
	WorkerErrorResponse,
} from "@autumn/balance-worker-client/protocol";
import {
	meteringRecordJson,
	serializeMeteringRecord,
	splitMeteringRecord,
} from "@autumn/kafka";
import { createCommitterStateStore } from "../../../src/committer/createCommitterStateStore.js";
import type { Committer } from "../../../src/committer/types/committer.js";
import {
	looksLikeCheckCommand,
	looksLikeTrackCommand,
} from "../../../src/http/commands/looksLikeCommands.js";
import { workerErrorOf } from "../../../src/http/handlers/errorHandler/workerErrorOf.js";
import {
	serializeCheckReply,
	serializeSubjectReply,
} from "../../../src/http/replies/serializeSubjectReply.js";
import { getBalanceWorkerLogger } from "../../../src/logging/getBalanceWorkerLogger.js";
import { resetMayBeDue } from "../../../src/processor/actions/ensureSubjectCurrent/earliestResetAt.js";
import { ensureSubjectCurrent } from "../../../src/processor/actions/ensureSubjectCurrent/ensureSubjectCurrent.js";
import { createCustomerPlans } from "../../../src/processor/commands/applyBillingPlan/customerPlans/customerPlans.js";
import { check as checkPartition } from "../../../src/processor/commands/check.js";
import { initialize as initializePartition } from "../../../src/processor/commands/initialize.js";
import { mutateTrack } from "../../../src/processor/commands/track.js";
import { createAcceptedCommands } from "../../../src/processor/common/acceptedCommands.js";
import { PartitionProcessorStateNotFoundError } from "../../../src/processor/common/processorErrors.js";
import { slimReplySubject } from "../../../src/processor/replies/slimReplySubject.js";
import { createSubjectHydrator } from "../../../src/processor/subject/createSubjectHydrator.js";
import { createSubjectDecisions } from "../../../src/processor/subject/subjectDecisions/createSubjectDecisions.js";
import type { PartitionProcessorScope } from "../../../src/processor/types/partitionProcessor.js";
import { createPartitionWriter } from "../../../src/processor/writer/createPartitionWriter.js";
import {
	loggedRecordOf,
	pendingKeyOf,
} from "../../../src/processor/writer/pendingMutations.js";
import { commandToFingerprint } from "../../../src/processor/writer/receipt/commandToFingerprint.js";
import { mutationToRecord } from "../../../src/processor/writer/receipt/mutationToRecord.js";
import { createRecentCommands } from "../../../src/processor/writer/recentCommands/createRecentCommands.js";
import type { CommittedOutcomeAppender } from "../../../src/processor/writer/types/partitionWriter.js";
import {
	PartitionWriterCapacityError,
	PartitionWriterCommandConflictError,
	PartitionWriterDuplicateCommandError,
	PartitionWriterRecoveryRequiredError,
} from "../../../src/processor/writer/writerErrors.js";
import {
	createSyntheticWorkerDb,
	createTestCatalogCache,
} from "../../fixtures/catalog.js";
import {
	createInitializeRequest,
	testIdentity,
} from "../../fixtures/mutations.js";
import { scenarios } from "../track-throughput/scenarios.js";
import { KIND } from "./protocol.js";
import type { Command, Core, Outcome, RecordAppender } from "./sequencer.js";

// The equality run pins the wall clock (a Worker has its own Date, so the baseline's patch does not reach here).
const fixedClock = process.env.SPIKE_FIXED_CLOCK;
if (fixedClock) Date.now = () => Number(fixedClock);

const TOPIC = process.env.SPIKE_TOPIC ?? "bw-spike-metering";
const LIMITS = {
	maxBatchSize: 500,
	maxPendingCommands: 4000,
	maxPendingCommandsPerCustomer: 1000,
	commitLingerMs: 5,
};
const INVALID = JSON.stringify({
	error: { code: "INVALID_REQUEST", message: "Invalid request" },
} satisfies WorkerErrorResponse);
/** The sequencer cuts, as bits of DIET (default: all): 1 record splice, 2 dedup by pending key, 4 batched ack-time
 *  forget, 8 encode the record once as text straight into the ring (no per-object cache, no Buffers; overrides 1). */
const DIET = Number(process.env.DIET ?? 7);
const diet = {
	splice: (DIET & 1) !== 0 && (DIET & 8) === 0,
	dedupKey: (DIET & 2) !== 0,
	batchedForget: (DIET & 4) !== 0,
	encodeOnce: (DIET & 8) !== 0,
};

/** A decided, not yet acknowledged, record: what the ack needs to finish (dedup window, pins) and what a duplicate re-reads. */
type InFlight = {
	seq: number;
	/** The writer's pending key, which is also the dedup window's key. */
	key: string;
	customerKey: string;
	fingerprint: string;
	/** Only the identity-keyed `remember` (no dedup-key cut) still needs the record at ack time. */
	mutation: MutationRecord | null;
	body: string;
	subjectKeys: string[];
};

export async function createLeanCore({
	appender,
}: {
	appender: RecordAppender;
	logRate: number;
}): Promise<Core> {
	const scenario = scenarios[process.env.SPIKE_SCENARIO ?? "typical"];
	if (!scenario) throw new Error("scenario");

	// The writer's own appends (initialize, resets) go through the same seq stream as lean records.
	const writerAppender: CommittedOutcomeAppender = {
		encodedBytesOf: ({ record }) => {
			const { key, value } = serializeMeteringRecord({ record });
			return key.length + value.length;
		},
		async appendCommitted({ outcomes }) {
			const records = outcomes.map((record) =>
				serializeMeteringRecord({ record }),
			);
			return { baseOffset: await appender.append({ records }).committed };
		},
	};
	const committer: Committer = {
		async apply({ records, expectedOffset }) {
			const last = records.at(-1);
			return { nextOffset: last ? last.position.offset + 1n : expectedOffset };
		},
		drain: async () => undefined,
		stop: () => undefined,
	};
	const stateStore = createCommitterStateStore({
		ctx: {
			committer,
			db: {
				readPartitionProgress: async () => null,
				insertPartitionProgress: async () => undefined,
				claimPartitionProgress: async () => undefined,
			},
		},
	});
	await stateStore.initializePartition({
		topic: TOPIC,
		partition: 0,
		nextOffset: 0n,
	});
	const db = createSyntheticWorkerDb();
	const receiptPolicy = { retentionMs: 86_400_000, now: () => Date.now() };
	const recentCommands = createRecentCommands({
		windowMs: Number(process.env.SPIKE_DEDUP_WINDOW_MS ?? 600_000),
		now: () => Date.now(),
	});
	const subjectDecisions = createSubjectDecisions();
	const fullStateStore = {
		...stateStore,
		readCommandNextOffset: () => null,
		advanceCommandNextOffset: async () => undefined,
	};
	const writer = createPartitionWriter({
		ctx: {
			stateStore: fullStateStore,
			appender: writerAppender,
			receiptPolicy,
			recentCommands,
			logger: getBalanceWorkerLogger(),
			onStateAdvanced: (advanced) => {
				subjectHydrator.inheritCatalog(advanced);
				subjectDecisions.advance(advanced);
			},
		},
		config: { topic: TOPIC, partition: 0, limits: LIMITS },
	});
	const subjectHydrator = createSubjectHydrator({
		ctx: {
			catalogCache: createTestCatalogCache({ db, rows: scenario.catalogRows }),
			db,
			writer,
			receiptPolicy,
			baseline: fullStateStore.baseline,
			logger: getBalanceWorkerLogger(),
		},
	});
	const scope: PartitionProcessorScope = {
		ctx: {
			stateStore: fullStateStore,
			catalogCache: createTestCatalogCache({ db, rows: scenario.catalogRows }),
			db,
			appender: writerAppender,
			receiptPolicy,
			recentCommands,
			assertCanRead: () => undefined,
			config: { topic: TOPIC, partition: 0, writerLimits: LIMITS },
			writer,
			subjectHydrator,
			subjectDecisions,
		} as PartitionProcessorScope["ctx"],
		accepted: createAcceptedCommands(),
		customerPlans: createCustomerPlans(),
	};
	await initializePartition({
		scope,
		request: createInitializeRequest({
			state: scenario.stateFor({ identity: testIdentity }),
			commandId: "init_0",
			requestId: "req_init_0",
		}),
	});
	const writerScope = writer.readScope();
	const subjects = writerScope.state.subjects;

	const inFlight = new Map<string, InFlight>();
	const inFlightBySeq: InFlight[] = [];
	const inFlightPerCustomer = new Map<string, number>();
	let recoveryError: Error | null = null;
	const stats = {
		tracks: 0,
		checks: 0,
		duplicates: 0,
		invalid: 0,
		failed: 0,
		overloaded: 0,
		acked: 0,
		resetsAwaited: 0,
		spliced: 0,
	};
	// Phase timers (ns): what the sequencer spends per track, by phase. `Bun.nanoseconds` costs ~30 ns a call.
	const phase = {
		parse: 0,
		readDedup: 0,
		mutate: 0,
		advance: 0,
		record: 0,
		project: 0,
		reply: 0,
		ack: 0,
	};
	const now = Bun.nanoseconds;

	function decideTrack(
		command: TrackCommand,
		commandBytes: Uint8Array | null,
	): Outcome | Promise<Outcome> {
		if (recoveryError) throw recoveryError;
		const { identity } = command;
		const customerKey = meteringIdentityToPartitionKey({ identity });
		let state = writer.readFreshestState({ identity });
		// Rare paths (not resident, a reset due) go through the processor's own ensure, off this synchronous path.
		if (!state || resetMayBeDue({ state, asOf: command.occurredAt })) {
			stats.resetsAwaited++;
			return ensureSubjectCurrent({ scope, command }).then(() => {
				state = writer.readFreshestState({ identity });
				if (!state)
					throw new PartitionProcessorStateNotFoundError({ customerKey });
				// The command ring slot may be reused by now: the record is re-encoded.
				return decideResident({
					command,
					state,
					customerKey,
					commandBytes: null,
				});
			});
		}
		return decideResident({ command, state, customerKey, commandBytes });
	}

	function decideResident({
		command,
		state,
		customerKey,
		commandBytes,
	}: {
		command: TrackCommand;
		state: SubjectState;
		customerKey: string;
		commandBytes: Uint8Array | null;
	}): Outcome {
		const { identity, commandId } = command;
		let t = now();
		const fingerprint = commandToFingerprint({ command });
		const pendingKey = pendingKeyOf({ customerKey, commandId });
		const dup = inFlight.get(pendingKey);
		if (dup) {
			if (dup.fingerprint !== fingerprint)
				throw new PartitionWriterCommandConflictError({ commandId });
			stats.duplicates++;
			return { status: 200, body: dup.body, seq: dup.seq };
		}
		const remembered = diet.dedupKey
			? recentCommands.read({ key: pendingKey })
			: recentCommands.read({ identity, commandId });
		if (remembered) {
			if (remembered.fingerprint !== fingerprint)
				throw new PartitionWriterCommandConflictError({ commandId });
			throw new PartitionWriterDuplicateCommandError({ commandId });
		}
		let perCustomer = inFlightPerCustomer.get(customerKey) ?? 0;
		if (
			inFlight.size >= LIMITS.maxPendingCommands ||
			perCustomer >= LIMITS.maxPendingCommandsPerCustomer
		) {
			appender.pumpAcks();
			perCustomer = inFlightPerCustomer.get(customerKey) ?? 0;
			if (
				inFlight.size >= LIMITS.maxPendingCommands ||
				perCustomer >= LIMITS.maxPendingCommandsPerCustomer
			) {
				stats.overloaded++;
				throw new PartitionWriterCapacityError();
			}
		}

		const decidedAgainst: { catalog?: Catalog; effects?: MutationEffect[] } =
			{};
		let t2 = now();
		phase.readDedup += t2 - t;
		t = t2;
		const result = mutateTrack({
			scope,
			state,
			customerKey,
			command,
			decidedAgainst,
		});
		if (result.kind === "reply")
			return { status: 200, body: JSON.stringify(result.reply), seq: 0 };
		t2 = now();
		phase.mutate += t2 - t;
		t = t2;

		// What the writer's onStateAdvanced does: the hydrator inherits the catalog, the memos move with the revision.
		subjectHydrator.inheritCatalog({
			from: state,
			to: result.nextState,
			changes: result.mutation.changes,
		});
		subjectDecisions.advance({
			from: state,
			to: result.nextState,
			changes: result.mutation.changes,
		});
		t2 = now();
		phase.advance += t2 - t;
		t = t2;

		const mutation = mutationToRecord({
			mutation: result.mutation,
			fingerprint,
			receiptPolicy,
		});
		const logged = loggedRecordOf({ mutation, effects: result.effects });
		if (diet.splice && commandBytes) stats.spliced++;
		let seq: number;
		if (diet.splice && commandBytes)
			seq = appender.emitSplit({
				split: splitMeteringRecord({
					record: logged,
					partitionKey: customerKey,
				}),
				commandBytes,
			});
		else if (diet.encodeOnce)
			seq = appender.emitText({
				key: customerKey,
				value: meteringRecordJson({ record: logged }),
			});
		else seq = appender.emit(serializeMeteringRecord({ record: logged }));
		t2 = now();
		phase.record += t2 - t;
		t = t2;

		// Project: the next decision for this subject reads these rows. Pinned until the ack.
		const parts = splitSubjectState({ state: result.nextState });
		const projected = parts.entity
			? [parts.customer, parts.entity]
			: [parts.customer];
		const subjectKeys: string[] = [];
		for (const part of projected) {
			const subjectKey = meteringIdentityToSubjectKey({
				identity: part.identity,
			});
			subjects.pin({ subjectKey });
			subjects.setState({ subjectKey, customerKey, state: part });
			subjectKeys.push(subjectKey);
		}

		t2 = now();
		phase.project += t2 - t;
		t = t2;
		const catalog =
			decidedAgainst.catalog ??
			subjectHydrator.readCatalog({ state: result.nextState });
		const body = serializeSubjectReply({
			reply: {
				result: mutation.result,
				changes: mutation.changes,
				...slimReplySubject({
					state: result.nextState,
					catalog,
					featureId: command.featureId,
				}),
				effects: decidedAgainst.effects ?? [],
			} as never,
		});
		const entry: InFlight = {
			seq,
			key: pendingKey,
			customerKey,
			fingerprint,
			mutation: diet.dedupKey ? null : mutation,
			body,
			subjectKeys,
		};
		inFlight.set(pendingKey, entry);
		inFlightBySeq.push(entry);
		inFlightPerCustomer.set(customerKey, perCustomer + 1);
		stats.tracks++;
		phase.reply += now() - t;
		return { status: 200, body, seq };
	}

	async function decideCheck(command: CheckCommand): Promise<Outcome> {
		if (recoveryError) throw recoveryError;
		stats.checks++;
		const reply = await checkPartition({ scope, command });
		return {
			status: 200,
			body: serializeCheckReply({ reply: reply as CheckReply }),
			seq: 0,
		};
	}

	function decide(command: Command): Outcome | Promise<Outcome> {
		let parsed: { command?: unknown } | undefined;
		const t = now();
		try {
			parsed = JSON.parse(command.text);
		} catch {
			parsed = undefined;
		}
		const input = parsed?.command;
		// The I/O worker sliced `{"route":{...},"command":{...}}`; a third member would make its slice wrong.
		const commandBytes =
			command.commandBytes && parsed && Object.keys(parsed).length === 2
				? command.commandBytes
				: null;
		phase.parse += now() - t;
		try {
			if (command.kind === KIND.TRACK && looksLikeTrackCommand(input))
				return wrapErrors(decideTrack(input as TrackCommand, commandBytes));
			if (command.kind === KIND.CHECK && looksLikeCheckCommand(input))
				return wrapErrors(decideCheck(input as CheckCommand));
		} catch (cause) {
			return errorOutcomeOf(cause);
		}
		stats.invalid++;
		return { status: 400, body: INVALID, seq: 0 };
	}

	function wrapErrors(
		outcome: Outcome | Promise<Outcome>,
	): Outcome | Promise<Outcome> {
		if (outcome instanceof Promise) return outcome.catch(errorOutcomeOf);
		return outcome;
	}

	function errorOutcomeOf(cause: unknown): Outcome {
		stats.failed++;
		const { status, error } = workerErrorOf({ cause: cause as Error });
		return {
			status,
			body: JSON.stringify({ error } satisfies WorkerErrorResponse),
			seq: 0,
		};
	}

	/** The ack finishes a whole range: remember for dedup, release pins, forget the in-flight entry. */
	function onAck({
		from,
		to,
		baseOffset,
	}: {
		from: number;
		to: number;
		baseOffset: bigint;
	}): void {
		const t = now();
		try {
			onAckInner({ from, to, baseOffset });
		} finally {
			phase.ack += now() - t;
		}
	}

	function onAckInner({
		from,
		to,
		baseOffset,
	}: {
		from: number;
		to: number;
		baseOffset: bigint;
	}): void {
		if (baseOffset < 0n) {
			recoveryError = new PartitionWriterRecoveryRequiredError({
				cause: new Error(`batch ${from}..${to} failed`),
			});
			for (const entry of inFlightBySeq)
				for (const subjectKey of entry.subjectKeys)
					subjects.unpin({ subjectKey });
			inFlightBySeq.length = 0;
			inFlight.clear();
			inFlightPerCustomer.clear();
			return;
		}
		let n = 0;
		while (n < inFlightBySeq.length && (inFlightBySeq[n] as InFlight).seq <= to)
			n++;
		if (n === 0) return;
		if (diet.batchedForget) forgetSettledRange({ count: n });
		else forgetSettledEach({ count: n });
		inFlightBySeq.splice(0, n);
		stats.acked += n;
	}

	function forgetSettledEach({ count }: { count: number }): void {
		for (let i = 0; i < count; i++) {
			const entry = inFlightBySeq[i] as InFlight;
			if (entry.mutation) recentCommands.remember({ mutation: entry.mutation });
			else
				recentCommands.remember({
					key: entry.key,
					fingerprint: entry.fingerprint,
				});
			for (const subjectKey of entry.subjectKeys)
				subjects.unpin({ subjectKey });
			inFlight.delete(entry.key);
			const left = (inFlightPerCustomer.get(entry.customerKey) ?? 1) - 1;
			if (left <= 0) inFlightPerCustomer.delete(entry.customerKey);
			else inFlightPerCustomer.set(entry.customerKey, left);
		}
	}

	/** One pass for the whole acked range: the dedup window takes the batch under one clock read, pins and
	 *  per-customer counts are released by their totals rather than entry by entry. */
	function forgetSettledRange({ count }: { count: number }): void {
		const settled = inFlightBySeq.slice(0, count);
		recentCommands.rememberAll({ commands: settled });
		let lastCustomer: string | null = null;
		let perCustomer = 0;
		const unpins = new Map<string, number>();
		for (const entry of settled) {
			inFlight.delete(entry.key);
			for (const subjectKey of entry.subjectKeys)
				unpins.set(subjectKey, (unpins.get(subjectKey) ?? 0) + 1);
			if (entry.customerKey === lastCustomer) {
				perCustomer++;
				continue;
			}
			if (lastCustomer !== null)
				releaseCustomer({ customerKey: lastCustomer, count: perCustomer });
			lastCustomer = entry.customerKey;
			perCustomer = 1;
		}
		if (lastCustomer !== null)
			releaseCustomer({ customerKey: lastCustomer, count: perCustomer });
		for (const [subjectKey, count] of unpins)
			subjects.unpin({ subjectKey, count });
	}

	function releaseCustomer({
		customerKey,
		count,
	}: {
		customerKey: string;
		count: number;
	}): void {
		const left = (inFlightPerCustomer.get(customerKey) ?? count) - count;
		if (left <= 0) inFlightPerCustomer.delete(customerKey);
		else inFlightPerCustomer.set(customerKey, left);
	}

	function phaseStats(): Record<string, number> {
		const tracks = Math.max(1, stats.tracks);
		const out: Record<string, number> = {};
		for (const [name, ns] of Object.entries(phase))
			out[`us_${name}`] = Math.round(ns / tracks / 10) / 100;
		return out;
	}

	return {
		decide,
		onAck,
		stats: () => ({ ...stats, inFlight: inFlight.size, ...phaseStats() }),
	};
}

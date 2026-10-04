/**
 * Allocation map of one track on the sequencer: runs the lean core's steps on the `typical` scenario for
 * STAGES (cumulative: parse, dedup, decide, advance, record, project, reply) N times and prints ns per track.
 * Run under `BUN_JSC_logGC=1 BUN_JSC_largeHeapSize=1048576` and sum the "bytes allocated this cycle" lines
 * to get bytes per track; the difference between two STAGES values is one step's allocation.
 */
import {
	advanceDeductionContext,
	applyMutation,
	type Catalog,
	computeTrackDecision,
	type MutationEffect,
	meteringIdentityToPartitionKey,
	meteringIdentityToSubjectKey,
	type SubjectState,
	splitSubjectState,
	type TrackCommand,
	trackCommandToDeductionRequest,
} from "@autumn/balance-engine";
import { meteringPayloadJson } from "@autumn/kafka";
import { Decimal } from "../../../../../packages/balance-engine/node_modules/decimal.js/decimal.js";
import { trackOutcomeToMutation } from "../../../../../packages/balance-engine/src/commands/track/trackOutcomeToMutation.js";
import {
	deductionStateToOutcome,
	deductWithContext,
} from "../../../../../packages/balance-engine/src/deduction/deduct.js";
import {
	drawIntegersFromBuckets,
	isIntegerDraw,
} from "../../../../../packages/balance-engine/src/deduction/utils/draw/integerDraw.js";
import { createCommitterStateStore } from "../../../src/committer/createCommitterStateStore.js";
import type { Committer } from "../../../src/committer/types/committer.js";
import { looksLikeTrackCommand } from "../../../src/http/commands/looksLikeCommands.js";
import { serializeSubjectReply } from "../../../src/http/replies/serializeSubjectReply.js";
import { getBalanceWorkerLogger } from "../../../src/logging/getBalanceWorkerLogger.js";
import { createCustomerPlans } from "../../../src/processor/commands/applyBillingPlan/customerPlans/customerPlans.js";
import { initialize as initializePartition } from "../../../src/processor/commands/initialize.js";
import { mutateTrack } from "../../../src/processor/commands/track.js";
import { createAcceptedCommands } from "../../../src/processor/common/acceptedCommands.js";
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
import { createHashedRecentCommands } from "../../../src/processor/writer/recentCommands/createHashedRecentCommands.js";
import type { CommittedOutcomeAppender } from "../../../src/processor/writer/types/partitionWriter.js";
import {
	createSyntheticWorkerDb,
	createTestCatalogCache,
} from "../../fixtures/catalog.js";
import {
	createInitializeRequest,
	testIdentity,
} from "../../fixtures/mutations.js";
import { scenarios } from "../track-throughput/scenarios.js";

const STAGES = Number(process.env.STAGES ?? 7);
/** With STAGES=32: 321..324 stop inside computeTrackDecision (see below). */
const SUB = Number(process.env.SUB ?? 0);
const N = Number(process.env.N ?? 100_000);
const TOPIC = "bw-alloc-bench";
const LIMITS = {
	maxBatchSize: 500,
	maxPendingCommands: 4000,
	maxPendingCommandsPerCustomer: 1000,
	commitLingerMs: 5,
};

const scenario = scenarios.typical;
if (!scenario) throw new Error("scenario");
const writerAppender: CommittedOutcomeAppender = {
	encodedBytesOf: () => 1000,
	async appendCommitted() {
		return { baseOffset: 0n };
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
const recentCommands = createHashedRecentCommands({
	windowMs: 600_000,
	now: () => Date.now(),
	expectedCommands: 1 << 17,
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
const subjects = writer.readScope().state.subjects;
const template = await Bun.file(
	new URL("../rust-front/track-template.json", import.meta.url),
).text();
const customerKey = meteringIdentityToPartitionKey({ identity: testIdentity });

let state = writer.readFreshestState({
	identity: testIdentity,
}) as SubjectState;
let sink = 0;
const started = Bun.nanoseconds();
for (let i = 0; i < N; i++) {
	const text = template.replaceAll("__ID__", `ab${i}`);
	// 1 parse
	const parsed = JSON.parse(text) as { command: unknown };
	const command = parsed.command as TrackCommand;
	if (!looksLikeTrackCommand(command)) throw new Error("shape");
	if (STAGES < 2) continue;
	// 2 dedup
	const fingerprint = commandToFingerprint({ command });
	const pendingKey = pendingKeyOf({
		customerKey,
		commandId: command.commandId,
	});
	if (recentCommands.recall({ key: pendingKey, fingerprint }) !== "unknown")
		throw new Error("dup");
	if (STAGES < 3) continue;
	// 3 decide (engine): carried-context read, computeTrackDecision, applyMutation, effects
	// (STAGES 31/32/33 stop after the memo read / the decision / the apply, without effects)
	const decidedAgainst: { catalog?: Catalog; effects?: MutationEffect[] } = {};
	let result: ReturnType<typeof mutateTrack>;
	if (STAGES >= 31 && STAGES <= 34) {
		const catalog = subjectHydrator.readCatalog({ state });
		const carried = subjectDecisions.readTrackDecision({
			state,
			identity: command.identity,
			request: trackCommandToDeductionRequest({ command }),
			catalog,
			join: () =>
				subjectHydrator.readSubjectWith({
					state,
					catalog,
					identity: command.identity,
				}),
		});
		if (STAGES === 31) {
			sink += carried.context.rows.length;
			continue;
		}
		if (SUB > 0) {
			// 321 request + integer draw · 322 + outcome · 323 + deductWithContext as one · 324 + trackOutcomeToMutation
			const request = trackCommandToDeductionRequest({ command });
			const context = carried.context;
			if (SUB === 323) {
				const outcome = deductWithContext({ context, request });
				sink += outcome.deltas.length;
				continue;
			}
			if (!isIntegerDraw({ context, request })) throw new Error("not integer");
			const { remaining, deltas } = drawIntegersFromBuckets({
				context,
				request,
			});
			if (SUB === 321) {
				sink += deltas.length + remaining;
				continue;
			}
			const outcome = deductionStateToOutcome({
				context,
				deductionState: {
					remaining: new Decimal(remaining),
					terms: request.terms,
					deltas,
					usageWindowConsumed: new Map(),
				},
				request,
			});
			if (SUB === 322) {
				sink += outcome.changes.length;
				continue;
			}
			const mutation = trackOutcomeToMutation({
				command,
				outcome,
				fullSubject: carried.fullSubject,
				revision: state.revision,
			});
			sink += mutation.changes.length;
			continue;
		}
		const decision = computeTrackDecision({
			fullSubject: carried.fullSubject,
			command,
			context: carried.context,
			revision: state.revision,
		});
		if (STAGES === 32) {
			sink += decision.mutation.changes.length;
			continue;
		}
		const nextState = applyMutation({ state, mutation: decision.mutation });
		// 34: ten extra advances of the carried context, to weigh advanceDeductionContext alone
		if (STAGES === 34)
			for (let k = 0; k < 10; k++)
				sink +=
					advanceDeductionContext({
						context: carried.context,
						changes: decision.mutation.changes,
					})?.rows.length ?? 0;
		result = {
			kind: "write",
			mutation: decision.mutation,
			nextState,
			effects: [],
		};
	} else {
		result = mutateTrack({
			scope,
			state,
			customerKey,
			command,
			decidedAgainst,
		});
	}
	if (result.kind !== "write") throw new Error("reply");
	if (STAGES < 4 && STAGES !== 33 && STAGES !== 34) continue;
	// 4 advance the memos (needed for the next decide to hit the carried context)
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
	const previous = state;
	state = result.nextState;
	if (STAGES < 5 || STAGES === 33 || STAGES === 34) {
		recentCommands.remember({ key: pendingKey, fingerprint });
		continue;
	}
	// 5 record text
	const mutation = mutationToRecord({
		mutation: result.mutation,
		fingerprint,
		receiptPolicy,
	});
	const logged = loggedRecordOf({ mutation, effects: result.effects });
	sink += meteringPayloadJson({ record: logged }).length;
	if (STAGES < 6) {
		recentCommands.remember({ key: pendingKey, fingerprint });
		continue;
	}
	// 6 project
	const parts = splitSubjectState({ state: result.nextState });
	for (const part of parts.entity
		? [parts.customer, parts.entity]
		: [parts.customer]) {
		const subjectKey = meteringIdentityToSubjectKey({
			identity: part.identity,
		});
		subjects.pin({ subjectKey });
		subjects.setState({ subjectKey, customerKey, state: part });
		subjects.unpin({ subjectKey });
	}
	if (STAGES < 7) {
		recentCommands.remember({ key: pendingKey, fingerprint });
		continue;
	}
	// 7 reply
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
	sink += body.length;
	recentCommands.remember({ key: pendingKey, fingerprint });
	void previous;
}
const elapsed = Bun.nanoseconds() - started;
console.log(
	JSON.stringify({
		stages: STAGES,
		n: N,
		nsPerTrack: Math.round(elapsed / N),
		sink,
		revision: state.revision,
		counters: subjectDecisions.readCounters?.(),
	}),
);

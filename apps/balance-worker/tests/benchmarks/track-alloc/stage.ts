import {
	advanceDeductionContext,
	applyMutation,
	computeTrackDecision,
	type MeteringIdentity,
	setupDeductionContext,
	type TrackCommand,
	trackCommandToDeductionRequest,
} from "@autumn/balance-engine";
import { parseWorkerRequest } from "@autumn/balance-worker-client/protocol";
import type { StagingArm } from "@autumn/edge-config";
import { type MeteringRecord, serializeMeteringRecord } from "@autumn/kafka";
import { deltasToUsageEventFields } from "../../../../../packages/balance-engine/src/common/usageEvent/deltasToUsageEventFields.js";
import { deductWithContext } from "../../../../../packages/balance-engine/src/deduction/deduct.js";
import { createCommitterStateStore } from "../../../src/committer/createCommitterStateStore.js";
import { TRACK_ALLOC_EXPERIMENT } from "../../../src/experiments/trackAlloc.js";
import { looksLikeTrackCommand } from "../../../src/http/commands/looksLikeCommands.js";
import { serializeSubjectReply } from "../../../src/http/replies/serializeSubjectReply.js";
import { createCustomerPlans } from "../../../src/processor/commands/applyBillingPlan/customerPlans/customerPlans.js";
import { initialize } from "../../../src/processor/commands/initialize.js";
import {
	toTrackReply,
	trackDecisionOf,
} from "../../../src/processor/commands/track.js";
import { createAcceptedCommands } from "../../../src/processor/common/acceptedCommands.js";
import { createSubjectHydrator } from "../../../src/processor/subject/createSubjectHydrator.js";
import { createSubjectDecisions } from "../../../src/processor/subject/subjectDecisions/createSubjectDecisions.js";
import type { PartitionProcessorScope } from "../../../src/processor/types/partitionProcessor.js";
import { createPartitionWriter } from "../../../src/processor/writer/createPartitionWriter.js";
import { createRecentCommands } from "../../../src/processor/writer/recentCommands/createRecentCommands.js";
import type { CommittedMutation } from "../../../src/processor/writer/types/mutation.js";
import {
	createSyntheticWorkerDb,
	createTestCatalogCache,
} from "../../fixtures/catalog.js";
import {
	createInitializeRequest,
	createTrackCommand,
	testIdentity,
} from "../../fixtures/mutations.js";
import { forceStagingArm } from "../../fixtures/stagingArms.js";
import { scenarios } from "../track-throughput/scenarios.js";

/**
 * One stage of a sync track, run `iterations` times in a synchronous loop after a "LOOP" marker on stderr.
 * With no event-loop turns inside the loop, every collection is JSC's allocation-triggered one, so the
 * `BUN_JSC_logGC=1` lines after the marker sum to the bytes the stage allocated.
 */
const [stage = "decide", iterationsArg = "20000", arm = "A"] =
	process.argv.slice(2);
const iterations = Number(iterationsArg);
forceStagingArm({ experiment: TRACK_ALLOC_EXPERIMENT, arm: arm as StagingArm });
const scenario = scenarios.typical;
if (!scenario) throw new Error("scenario");
const CUSTOMERS = 10;

const records: MeteringRecord[] = [];
const committedReplies: {
	command: TrackCommand;
	committed: CommittedMutation;
}[] = [];
const stateStore = createCommitterStateStore({
	ctx: {
		committer: {
			apply: async ({ records, expectedOffset }) => ({
				nextOffset:
					(records.at(-1)?.position.offset ?? expectedOffset - 1n) + 1n,
			}),
			drain: async () => undefined,
			stop: () => undefined,
		},
		db: {
			readPartitionProgress: async () => null,
			insertPartitionProgress: async () => undefined,
			claimPartitionProgress: async () => undefined,
		},
	},
});
await stateStore.initializePartition({
	topic: "t",
	partition: 0,
	nextOffset: 0n,
});
let appended = 0n;
const ctx = {
	stateStore: {
		...stateStore,
		readCommandNextOffset: () => null,
		advanceCommandNextOffset: async () => undefined,
	},
	appender: {
		appendCommitted: async ({
			outcomes,
		}: {
			outcomes: readonly MeteringRecord[];
		}) => {
			for (const record of outcomes) records.push(record);
			const baseOffset = appended;
			appended += BigInt(outcomes.length);
			return { baseOffset };
		},
	},
	catalogCache: createTestCatalogCache({ rows: scenario.catalogRows }),
	db: createSyntheticWorkerDb(),
	receiptPolicy: { retentionMs: 86_400_000, now: () => Date.now() },
	recentCommands: createRecentCommands({
		windowMs: 600_000,
		now: () => Date.now(),
	}),
	assertCanRead: () => undefined,
};
const config = {
	topic: "t",
	partition: 0,
	writerLimits: {
		maxBatchSize: 500,
		maxPendingCommands: 10_000_000,
		maxPendingCommandsPerCustomer: 10_000_000,
	},
};
const subjectDecisions = createSubjectDecisions();
const writer = createPartitionWriter({
	ctx: {
		stateStore: ctx.stateStore,
		appender: ctx.appender,
		receiptPolicy: ctx.receiptPolicy,
		recentCommands: ctx.recentCommands,
		onStateAdvanced: (advanced) => {
			subjectHydrator.inheritCatalog(advanced);
			subjectDecisions.advance(advanced);
		},
	},
	config: { topic: "t", partition: 0, limits: config.writerLimits },
});
const subjectHydrator = createSubjectHydrator({
	ctx: {
		catalogCache: ctx.catalogCache,
		db: ctx.db,
		writer,
		receiptPolicy: ctx.receiptPolicy,
		baseline: ctx.stateStore.baseline,
	},
});
const scope: PartitionProcessorScope = {
	ctx: { ...ctx, config, writer, subjectHydrator, subjectDecisions },
	accepted: createAcceptedCommands(),
	customerPlans: createCustomerPlans(),
};

const identities: MeteringIdentity[] = Array.from(
	{ length: CUSTOMERS },
	(_, index) => ({ ...testIdentity, customerId: `cus_${index}` }),
);
for (const [index, identity] of identities.entries())
	await initialize({
		scope,
		request: createInitializeRequest({
			state: scenario.stateFor({ identity }),
			commandId: `init_${index}`,
			requestId: `req_init_${index}`,
		}),
	});

let sequence = 0;
function commandsOf(count: number): TrackCommand[] {
	return Array.from({ length: count }, () => {
		const n = sequence++;
		return createTrackCommand({
			identity: identities[n % CUSTOMERS] ?? testIdentity,
			commandId: `trk_${n}`,
			featureId: scenario.features[n % scenario.features.length],
			value: 1,
			occurredAt: 1_700_000_000_000 + n,
		});
	});
}

/** Decides `commands` and lets them commit, keeping each record and committed state for the later stages. */
async function decideAndCommit(commands: TrackCommand[]) {
	const committed: Promise<unknown>[] = [];
	for (const command of commands) {
		const { submission } = trackDecisionOf({ scope, command });
		const decided = writer.decide(submission);
		committed.push(
			decided.waitForCommit().then((value) => {
				committedReplies.push({
					command,
					committed: value as CommittedMutation,
				});
			}),
		);
	}
	await Promise.all(committed);
	await writer.waitForApplies();
}

// Warm the JIT and the carried contexts on the same path the loop runs.
await decideAndCommit(commandsOf(1_000));
records.length = 0;
committedReplies.length = 0;
const ring: unknown[] = new Array(64);
const sink = (index: number, value: unknown) => {
	ring[index & 63] = value;
};

let run: () => void;
switch (stage) {
	case "parse": {
		const bodies = commandsOf(iterations).map((command) =>
			JSON.stringify({ route: { partition: 0, routeEpoch: "1" }, command }),
		);
		run = () => {
			for (let index = 0; index < bodies.length; index++) {
				const parsed = parseWorkerRequest({
					input: JSON.parse(bodies[index] ?? ""),
				});
				sink(index, looksLikeTrackCommand(parsed.command) && parsed);
			}
		};
		break;
	}
	case "decide": {
		const commands = commandsOf(iterations);
		run = () => {
			for (let index = 0; index < commands.length; index++) {
				const command = commands[index];
				if (!command) continue;
				const { submission } = trackDecisionOf({ scope, command });
				sink(index, writer.decide(submission));
			}
		};
		break;
	}
	case "encode": {
		records.length = 0;
		await decideAndCommit(commandsOf(iterations));
		const fresh = records.slice();
		run = () => {
			for (let index = 0; index < fresh.length; index++) {
				const record = fresh[index];
				if (record) sink(index, serializeMeteringRecord({ record }));
			}
		};
		break;
	}
	case "reply": {
		committedReplies.length = 0;
		await decideAndCommit(commandsOf(iterations));
		const fresh = committedReplies.slice();
		run = () => {
			for (let index = 0; index < fresh.length; index++) {
				const entry = fresh[index];
				if (!entry) continue;
				const reply = toTrackReply({
					scope,
					command: entry.command,
					committed: entry.committed,
					decidedAgainst: {},
				});
				sink(index, serializeSubjectReply({ reply }));
			}
		};
		break;
	}
	case "mutate": {
		// mutateTrack alone, on one resident state: what the decide costs before the writer records and enqueues it.
		const identity = identities[0] ?? testIdentity;
		const state = writer.readFreshestState({ identity });
		if (!state) throw new Error("state");
		const commands = commandsOf(iterations).map((command) => ({
			...command,
			identity,
		}));
		run = () => {
			for (let index = 0; index < commands.length; index++) {
				const command = commands[index];
				if (!command) continue;
				const { submission } = trackDecisionOf({ scope, command });
				sink(index, submission.mutate({ state }));
			}
		};
		break;
	}
	case "deduct":
	case "usage":
	case "view":
	case "compute":
	case "apply":
	case "advance": {
		// The engine steps of one decide, on a hot customer's resident state and a set-up context.
		const identity = identities[0] ?? testIdentity;
		const state = writer.readFreshestState({ identity });
		if (!state) throw new Error("state");
		const catalog = subjectHydrator.readCatalog({ state });
		const fullSubject = subjectHydrator.readSubjectWith({
			state,
			catalog,
			identity,
		});
		const commands = commandsOf(iterations).map((command) => ({
			...command,
			identity,
		}));
		const first = commands[0];
		if (!first) throw new Error("commands");
		const context = setupDeductionContext({
			fullSubject,
			selection: trackCommandToDeductionRequest({ command: first }).selection,
		});
		const decisions = commands.map((command) =>
			computeTrackDecision({
				fullSubject,
				command,
				context,
				revision: state.revision,
				lean: arm === "B",
			}),
		);
		run = () => {
			for (let index = 0; index < commands.length; index++) {
				const command = commands[index];
				const decision = decisions[index];
				if (!command || !decision) continue;
				if (stage === "deduct")
					sink(
						index,
						deductWithContext({
							context,
							request: trackCommandToDeductionRequest({ command }),
							lean: arm === "B",
						}),
					);
				else if (stage === "usage")
					sink(
						index,
						deltasToUsageEventFields({
							fullSubject,
							deltas: decision.outcome.deltas,
							lean: arm === "B",
						}),
					);
				else if (stage === "view")
					sink(
						index,
						subjectHydrator.readSubjectWith({ state, catalog, identity }),
					);
				else if (stage === "compute")
					sink(
						index,
						computeTrackDecision({
							fullSubject,
							command,
							context,
							revision: state.revision,
							lean: arm === "B",
						}),
					);
				else if (stage === "apply")
					sink(index, applyMutation({ state, mutation: decision.mutation }));
				else
					sink(
						index,
						advanceDeductionContext({
							context,
							changes: decision.mutation.changes,
							lean: arm === "B",
						}),
					);
			}
		};
		break;
	}
	default:
		throw new Error(`Unknown stage ${stage}`);
}

Bun.gc(true);
process.stderr.write("LOOP\n");
const cpuBefore = process.cpuUsage();
run();
const cpu = process.cpuUsage(cpuBefore);
process.stderr.write(
	`DONE ${JSON.stringify({ stage, arm, iterations, cpuUsPerIteration: (cpu.user + cpu.system) / iterations })}\n`,
);
process.exit(0);

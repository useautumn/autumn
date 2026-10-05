import { describe, expect, test } from "bun:test";
import {
	applyMutation,
	computeTrack,
	type SubjectState,
	type TrackCommand,
} from "@autumn/balance-engine";
import { createPartitionWriter } from "../../../../src/processor/writer/createPartitionWriter.js";
import { createRecentCommands } from "../../../../src/processor/writer/recentCommands/createRecentCommands.js";
import type { PartitionWriterContext } from "../../../../src/processor/writer/types/partitionWriter.js";
import {
	createState,
	createSubjectFor,
	createTrackCommand,
	testIdentity,
} from "../../../fixtures/mutations.js";

type Warning = { fields: { event?: string; data?: Record<string, unknown> } };

const createFixture = () => {
	const clock = { ms: 1_000 };
	const warnings: Warning[] = [];
	let nextOffset = 0n;
	const stateStore: PartitionWriterContext["stateStore"] = {
		baseline: "map",
		readState: () => null,
		readOwnState: () => null,
		readReceipt: () => null,
		applyDurableMutations: async ({ records }) =>
			records.map((record) => ({
				kind: "applied" as const,
				mutation: record.mutation,
				nextOffset: record.position.offset + 1n,
			})),
	};
	const writer = createPartitionWriter({
		ctx: {
			stateStore,
			appender: {
				appendCommitted: async ({ outcomes }) => {
					const baseOffset = nextOffset;
					nextOffset += BigInt(outcomes.length);
					return { baseOffset };
				},
			},
			receiptPolicy: { retentionMs: 60_000, now: () => 1_700_000_000_000 },
			recentCommands: createRecentCommands({ windowMs: 600_000, now: () => 0 }),
			now: () => clock.ms,
			logger: {
				warn: (...args: unknown[]) => {
					warnings.push({ fields: args[0] as Warning["fields"] });
				},
			},
		},
		config: {
			topic: "autumn-metering",
			partition: 7,
			limits: {
				maxBatchSize: 100,
				maxPendingCommands: 100,
				maxPendingCommandsPerCustomer: 100,
			},
		},
	});
	let commandIndex = 0;
	const decide = ({
		takesMs,
		throws = false,
	}: {
		takesMs: number;
		throws?: boolean;
	}) => {
		commandIndex += 1;
		const command = createTrackCommand({
			identity: testIdentity,
			commandId: `cmd_${commandIndex}`,
			value: 1,
		});
		return writer.decide(
			trackSubmission({
				command,
				initial: createState({ balance: 1_000 }),
				during: () => {
					clock.ms += takesMs;
					if (throws) throw new Error("refused");
				},
			}),
		);
	};
	const slowDecides = () =>
		warnings.filter(
			({ fields }) => fields.event === "balance_worker.slow_decide",
		);
	return { clock, decide, slowDecides };
};

function trackSubmission({
	command,
	initial,
	during,
}: {
	command: TrackCommand;
	initial: SubjectState;
	during: () => void;
}) {
	return {
		command,
		mutate: ({ state }: { state: SubjectState | null }) => {
			during();
			const current = state ?? initial;
			const mutation = computeTrack({
				fullSubject: createSubjectFor({ state: current, entityId: null }),
				command,
			});
			return {
				kind: "write" as const,
				mutation,
				nextState: applyMutation({ state: current, mutation }),
			};
		},
	};
}

describe("slow decide logging", () => {
	test("a decide under the threshold logs nothing", () => {
		const { decide, slowDecides } = createFixture();
		decide({ takesMs: 3 });
		expect(slowDecides()).toHaveLength(0);
	});

	test("a slow decide names the customer, the command and its state size", () => {
		const { decide, slowDecides } = createFixture();
		decide({ takesMs: 2 });
		decide({ takesMs: 45 });

		expect(slowDecides()).toHaveLength(1);
		const data = slowDecides()[0]?.fields.data;
		expect(data).toMatchObject({
			topic: "autumn-metering",
			partition: 7,
			commandType: "track",
			customerId: testIdentity.customerId,
			entityId: null,
			durationMs: 45,
			pendingCommands: 2,
		});
		expect(data?.stateBytes).toBeGreaterThan(0);
	});

	test("a decide that throws after holding the thread is still reported", () => {
		const { decide, slowDecides } = createFixture();
		expect(() => decide({ takesMs: 60, throws: true })).toThrow("refused");
		expect(slowDecides()[0]?.fields.data).toMatchObject({ durationMs: 60 });
	});

	test("at most ten slow decides are logged per partition every ten seconds", () => {
		const { clock, decide, slowDecides } = createFixture();
		for (let index = 0; index < 15; index++) decide({ takesMs: 30 });
		expect(slowDecides()).toHaveLength(10);

		clock.ms += 10_000;
		decide({ takesMs: 30 });
		expect(slowDecides()).toHaveLength(11);
	});
});

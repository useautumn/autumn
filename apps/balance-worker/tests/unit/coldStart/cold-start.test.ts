import { describe, expect, test } from "bun:test";
import {
	applyMutation,
	computeTrack,
	type MeteringIdentity,
	type TrackCommand,
} from "@autumn/balance-engine";
import type {
	BalanceWorkerColdStartEdgeConfig,
	EdgeConfigS3Client,
} from "@autumn/edge-config";
import { createSlotHeartbeat } from "../../../src/blueGreen/createSlotHeartbeat.js";
import { SlotHeartbeatSchema } from "../../../src/blueGreen/types/slotHeartbeat.js";
import { createColdStart } from "../../../src/coldStart/createColdStart.js";
import type { ColdStartAck } from "../../../src/coldStart/types/coldStartAck.js";
import type { PartitionRuntimePort } from "../../../src/partitions/types/partitions.js";
import type { PartitionProcessor } from "../../../src/processor/types/partitionProcessor.js";
import { createPartitionWriter } from "../../../src/processor/writer/createPartitionWriter.js";
import { createRecentCommands } from "../../../src/processor/writer/recentCommands/createRecentCommands.js";
import { createSubjectMap } from "../../../src/processor/writer/subjectMap/createSubjectMap.js";
import type { MutateParams } from "../../../src/processor/writer/types/mutation.js";
import type { PartitionWriterContext } from "../../../src/processor/writer/types/partitionWriter.js";
import {
	createState,
	createSubjectFor,
	createTrackCommand,
} from "../../fixtures/mutations.js";

const identity: MeteringIdentity = {
	orgId: "org_1",
	env: "sandbox",
	customerId: "cus_1",
	entityId: null,
};
const other: MeteringIdentity = { ...identity, customerId: "cus_other" };

describe("subject map: dropUnpinned", () => {
	test("drops every resident subject but the pinned and the hidden, without an evict's DELETE", () => {
		const evicted: string[] = [];
		const map = createSubjectMap({
			onEvicted: ({ customerKey }) => evicted.push(customerKey),
		});
		const state = createState();
		map.setState({ subjectKey: "a", customerKey: "a", state });
		map.setState({ subjectKey: "b", customerKey: "b", state });
		map.setState({ subjectKey: "pinned", customerKey: "pinned", state });
		map.pin({ subjectKey: "pinned" });
		map.setState({ subjectKey: "hidden", customerKey: "hidden", state });
		map.hideCustomer({ customerKey: "hidden" });
		expect(map.residentCount()).toBe(3);

		expect(map.dropUnpinned()).toBe(2);
		expect(map.readState({ subjectKey: "a" })).toBeNull();
		expect(map.readState({ subjectKey: "pinned" })).toEqual(state);
		expect(map.residentCount()).toBe(1);
		expect(map.isEvicting({ customerKey: "hidden" })).toBe(true);
		expect(evicted).toEqual([]);
	});
});

const decideTrack = ({
	state,
	command,
}: MutateParams & { command: TrackCommand }) => {
	if (!state) throw new Error("Expected resident state");
	const mutation = computeTrack({
		fullSubject: createSubjectFor({ state }),
		command,
	});
	return {
		kind: "write" as const,
		mutation,
		nextState: applyMutation({ state, mutation }),
	};
};

const createWriter = () => {
	const applyGate = { held: Promise.resolve() as Promise<void> };
	const stateStore: PartitionWriterContext["stateStore"] = {
		baseline: "map",
		readState: () => null,
		readOwnState: () => null,
		readReceipt: () => null,
		applyDurableMutations: async ({ records }) => {
			await applyGate.held;
			return records.map((record) => ({
				kind: "applied" as const,
				mutation: record.mutation,
				nextOffset: record.position.offset + 1n,
			}));
		},
	};
	let nextOffset = 0n;
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
		},
		config: {
			topic: "cold-start",
			partition: 0,
			limits: {
				maxBatchSize: 100,
				maxPendingCommands: 100,
				maxPendingCommandsPerCustomer: 10,
			},
		},
	});
	const track = (commandId: string) => {
		const command = createTrackCommand({ identity, value: 1, commandId });
		return writer.decide({
			command,
			mutate: ({ state }) => decideTrack({ state, command }),
		});
	};
	return { writer, applyGate, track };
};

describe("writer: evictResident", () => {
	test("waits until the store holds the writes before it, then leaves nothing resident", async () => {
		const { writer, applyGate, track } = createWriter();
		writer.adopt({ state: createState({ identity, balance: 100 }) });
		writer.adopt({ state: createState({ identity: other, balance: 5 }) });
		const held = Promise.withResolvers<void>();
		applyGate.held = held.promise;
		const tracked = track("t1");
		await tracked.waitForCommit();

		let settled = false;
		const evicting = writer.evictResident().then((result) => {
			settled = true;
			return result;
		});
		await Bun.sleep(5);
		expect(settled).toBe(false);
		expect(writer.readFreshestState({ identity })).not.toBeNull();

		held.resolve();
		expect(await evicting).toEqual({ evicted: 2, resident: 0 });
		await tracked.waitForStore();
		expect(writer.readFreshestState({ identity })).toBeNull();
		expect(writer.readFreshestState({ identity: other })).toBeNull();
	});
});

const createRequests = (initial: string | null) => {
	let current: BalanceWorkerColdStartEdgeConfig = { requestId: initial };
	const listeners = new Set<
		(config: BalanceWorkerColdStartEdgeConfig) => void
	>();
	return {
		get: () => current,
		subscribe: (
			listener: (config: BalanceWorkerColdStartEdgeConfig) => void,
		) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		publish: (requestId: string | null) => {
			current = { requestId };
			for (const listener of listeners) listener(current);
		},
		listeners,
	};
};

const runtimeEvicting = (
	evictResident: PartitionProcessor["evictResident"],
): PartitionRuntimePort =>
	({
		process: (run: (processor: PartitionProcessor) => Promise<unknown>) =>
			run({ evictResident } as PartitionProcessor),
	}) as unknown as PartitionRuntimePort;

const createHarness = ({
	initial = null,
	runtimes,
}: {
	initial?: string | null;
	runtimes: Map<number, PartitionRuntimePort>;
}) => {
	const requests = createRequests(initial);
	let acked = 0;
	const warnings: unknown[] = [];
	const coldStart = createColdStart({
		ctx: {
			requests,
			partitions: {
				partitions: () =>
					[...runtimes.keys()].map((partition) => ({ partition }) as never),
				findOwnedRuntime: ({ partition }) => runtimes.get(partition),
			},
			logger: {
				info: () => undefined,
				warn: (...args: unknown[]) => warnings.push(args),
			},
			onAcked: () => {
				acked += 1;
			},
		},
	});
	const settle = () => Bun.sleep(1);
	return { coldStart, requests, settle, warnings, acked: () => acked };
};

describe("createColdStart", () => {
	test("each new request empties every served partition once and acks the sum", async () => {
		let calls = 0;
		const evictingAndCounting = (result: {
			evicted: number;
			resident: number;
		}) =>
			runtimeEvicting(async () => {
				calls += 1;
				return result;
			});
		const runtimes = new Map([
			[0, evictingAndCounting({ evicted: 3, resident: 0 })],
			[1, evictingAndCounting({ evicted: 4, resident: 1 })],
		]);
		const { coldStart, requests, settle, acked } = createHarness({ runtimes });
		coldStart.start();
		await settle();
		expect(coldStart.readAck()).toBeNull();

		requests.publish("lt42");
		requests.publish("lt42");
		await settle();
		const ack = coldStart.readAck() as ColdStartAck;
		expect(ack).toMatchObject({
			requestId: "lt42",
			evictedSubjects: 7,
			residentSubjects: 1,
			failedPartitions: [],
		});
		expect(calls).toBe(2);
		expect(acked()).toBe(1);
	});

	test("a request already pending at start is handled, so a fresh worker still acks it", async () => {
		const runtimes = new Map([
			[0, runtimeEvicting(async () => ({ evicted: 0, resident: 0 }))],
		]);
		const { coldStart, settle } = createHarness({ initial: "lt7", runtimes });
		coldStart.start();
		await settle();
		expect(coldStart.readAck()?.requestId).toBe("lt7");
	});

	test("a partition that fails is listed, so the request doesn't count as handled", async () => {
		const runtimes = new Map([
			[0, runtimeEvicting(async () => ({ evicted: 2, resident: 0 }))],
			[5, runtimeEvicting(async () => Promise.reject(new Error("fenced")))],
		]);
		const { coldStart, requests, settle, warnings } = createHarness({
			runtimes,
		});
		coldStart.start();
		requests.publish("lt9");
		await settle();
		expect(coldStart.readAck()).toMatchObject({
			evictedSubjects: 2,
			failedPartitions: [5],
		});
		expect(warnings).toHaveLength(1);
	});

	test("stop unsubscribes", () => {
		const { coldStart, requests } = createHarness({ runtimes: new Map() });
		coldStart.start();
		coldStart.stop();
		expect(requests.listeners.size).toBe(0);
	});
});

describe("heartbeat", () => {
	test("carries the latest ack where cold starts are honoured, and writes it soon after", async () => {
		const written: unknown[] = [];
		const s3Client: EdgeConfigS3Client = {
			send: async (command) => {
				written.push(JSON.parse((command.input as { Body: string }).Body));
				return {};
			},
		};
		let ack: ColdStartAck | null = null;
		const heartbeat = createSlotHeartbeat({
			ctx: {
				s3Client,
				location: { bucket: "autumn-test", region: "us-east-2" },
				gate: { describe: () => ({ active: true, reason: "active" }) },
				readPartitions: () => [],
				isAdmitted: () => false,
				readAssignmentSettled: () => true,
				readStoreHealthy: () => true,
				probes: {
					kafka: async () => undefined,
					postgres: async () => undefined,
				},
				readColdStart: () => ack,
				schedule: () => () => undefined,
			},
			config: {
				deployment: "staging",
				fleetId: "1a2b3c4d",
				endpoint: "http://10.0.0.7:8082",
				identity: { serviceArn: null, imageSha: null },
			},
		});
		await heartbeat.start();
		expect(SlotHeartbeatSchema.parse(written[0]).coldStart).toBeNull();

		ack = {
			requestId: "lt42",
			completedAt: new Date(0).toISOString(),
			durationMs: 3,
			evictedSubjects: 7,
			residentSubjects: 0,
			failedPartitions: [],
		};
		heartbeat.writeSoon();
		await Bun.sleep(1);
		expect(SlotHeartbeatSchema.parse(written.at(-1)).coldStart).toEqual(ack);
	});
});

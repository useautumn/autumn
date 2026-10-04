/**
 * Serial-decide arm D: `/v1/track-batch` on the hot path. The batch is decided whole on the main thread and
 * its reply held on its last write; every command's answer and every record it appends must be what the
 * ordinary batch handler produces.
 */
import { describe, expect, test } from "bun:test";
import type { TrackCommand } from "@autumn/balance-engine";
import type { MeteringRecord } from "@autumn/kafka";
import { createBalanceWorkerApp } from "../../../src/http/createBalanceWorkerApp.js";
import type {
	BalanceWorkerHttpContext,
	BalanceWorkerRequestContext,
} from "../../../src/http/types/balanceWorkerHttp.js";
import type { PartitionProcessor } from "../../../src/processor/types/partitionProcessor.js";
import { createHotDecider } from "../../../src/serialDecide/createHotDecider.js";
import { HOT_KIND } from "../../../src/serialDecide/hotProtocol.js";
import { createPositionBoard } from "../../../src/serialDecide/positionBoard.js";
import { createState, createTrackCommand } from "../../fixtures/mutations.js";
import {
	createResidentProcessor,
	residentIdentityOf,
} from "../../fixtures/residentProcessor.js";

const logger = { debug() {}, info() {}, warn() {}, error() {} };
const cus1 = residentIdentityOf({ customerId: "cus_1" });
const cus2 = residentIdentityOf({ customerId: "cus_2" });
const route = { partition: 0, routeEpoch: "1" };
const encoder = new TextEncoder();

async function settled(): Promise<void> {
	for (let i = 0; i < 20; i++)
		await new Promise((resolve) => setImmediate(resolve));
}

/** An open log that keeps every append, so two writers' records can be compared. */
function recordingAppender() {
	const appends: MeteringRecord[][] = [];
	let appended = 0n;
	return {
		appends,
		appender: {
			appendCommitted: async ({
				outcomes,
			}: {
				outcomes: readonly MeteringRecord[];
			}) => {
				appends.push([...outcomes]);
				const baseOffset = appended;
				appended += BigInt(outcomes.length);
				return { baseOffset };
			},
		},
	};
}

function contextFor({
	processor,
}: {
	processor: PartitionProcessor;
}): BalanceWorkerHttpContext {
	const runtime: BalanceWorkerRequestContext["runtime"] = {
		process: (run) => run(processor),
		processHot: (run) => run(processor),
	};
	return {
		ownership: { findRuntime: () => runtime },
		partitionResolver: { partitionForIdentity: () => 0 },
		logger,
	};
}

function batchBody({ commands }: { commands: unknown[] }): string {
	return JSON.stringify({ route, commands });
}

const states = [
	createState({ identity: cus1, balance: 100 }),
	createState({ identity: cus2, balance: 10 }),
];

/** The same partition twice: one answered by the ordinary handler, one by the hot decider. */
async function classicAndHot({ writerBatch = 100 } = {}) {
	const classicLog = recordingAppender();
	const hotLog = recordingAppender();
	const board = createPositionBoard({ config: { partitionCount: 1 } });
	const committed: number[] = [];
	board.onCommitted(({ seq }) => committed.push(seq));
	const writerLimits = {
		maxBatchSize: writerBatch,
		maxPendingCommands: 1_000,
		maxPendingCommandsPerCustomer: 1_000,
	};
	const classic = await createResidentProcessor({
		states,
		appender: classicLog.appender,
		config: { writerLimits },
	});
	const hot = await createResidentProcessor({
		states,
		appender: hotLog.appender,
		positions: board.sinkFor({ partition: 0 }),
		config: { writerLimits },
	});
	await settled();
	classicLog.appends.length = 0;
	hotLog.appends.length = 0;
	committed.length = 0;
	const app = createBalanceWorkerApp({
		ctx: contextFor({ processor: classic }),
	});
	const decider = createHotDecider({
		ctx: contextFor({ processor: hot }),
		config: { partitionCount: 1 },
	});
	async function viaClassic(commands: unknown[]): Promise<string> {
		const response = await app.fetch(
			new Request("http://worker/v1/track-batch", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: batchBody({ commands }),
			}),
		);
		expect(response.status).toBe(200);
		return response.text();
	}
	function viaHot(commands: unknown[]) {
		return decider.decide({
			kind: HOT_KIND.TRACK_BATCH,
			body: encoder.encode(batchBody({ commands })),
		});
	}
	return { classicLog, hotLog, committed, viaClassic, viaHot, decider, hot };
}

function byCustomer(appends: MeteringRecord[][]) {
	const records = new Map<string, MeteringRecord[]>();
	for (const record of appends.flat()) {
		const customer =
			(record as { subject?: { internalCustomerId?: string } }).subject
				?.internalCustomerId ?? "";
		records.set(customer, [...(records.get(customer) ?? []), record]);
	}
	return Object.fromEntries(records);
}

function track(params: Parameters<typeof createTrackCommand>[0]): TrackCommand {
	return createTrackCommand(params);
}

describe("hot track batch (serial-decide arm D)", () => {
	test("a mixed batch answers every command as the ordinary handler does and appends the same records", async () => {
		const { classicLog, hotLog, committed, viaClassic, viaHot } =
			await classicAndHot();
		const first = [
			track({ identity: cus1, commandId: "cmd_a", value: 5 }),
			// Over the balance with overage rejected: an answer, not an error.
			track({ identity: cus2, commandId: "cmd_b", value: 50 }),
			track({ identity: cus1, commandId: "cmd_c", value: 3 }),
			// A retry of a command earlier in the same batch.
			track({ identity: cus1, commandId: "cmd_a", value: 5 }),
			track({ identity: cus2, commandId: "cmd_d", value: 4 }),
		];
		const classicFirst = await viaClassic(first);
		const hotFirst = viaHot(first);
		expect(hotFirst?.status).toBe(200);
		expect(hotFirst?.body).toBe(classicFirst);
		await settled();
		expect(committed.at(-1)).toBe(hotFirst?.seq);

		const second = [
			// A retry of a committed command, and a reused id with another value.
			track({ identity: cus1, commandId: "cmd_c", value: 3 }),
			track({ identity: cus1, commandId: "cmd_a", value: 9 }),
			track({ identity: cus2, commandId: "cmd_e", value: 1 }),
		];
		const classicSecond = await viaClassic(second);
		const hotSecond = viaHot(second);
		expect(hotSecond?.body).toBe(classicSecond);
		const results = JSON.parse(classicSecond).results as { ok: boolean }[];
		expect(results.map((result) => result.ok)).toContain(false);
		await settled();

		// Track runs group the ordinary path's writes by customer; each customer's records and their order match.
		expect(byCustomer(hotLog.appends)).toEqual(byCustomer(classicLog.appends));
		expect(hotLog.appends.flat().length).toBeGreaterThan(0);
	});

	test("a batch with any command the hot path cannot take goes to the ordinary path whole, counted by reason", async () => {
		const { viaHot, decider, hotLog } = await classicAndHot();
		const locked = {
			...track({ identity: cus1, commandId: "cmd_lock" }),
			lock: { lockId: "lock_1", expiresAt: 1 },
		};
		expect(
			viaHot([track({ identity: cus1, commandId: "cmd_ok" }), locked]),
		).toBeNull();
		const stranger = residentIdentityOf({ customerId: "cus_none" });
		expect(
			viaHot([
				track({ identity: cus1, commandId: "cmd_ok" }),
				track({ identity: stranger, commandId: "cmd_n" }),
			]),
		).toBeNull();
		expect(viaHot([{ not: "a track" }])).toBeNull();
		await settled();
		// Nothing of a refused batch was written.
		expect(hotLog.appends.flat()).toHaveLength(0);

		viaHot([
			track({ identity: cus1, commandId: "cmd_1", value: 1 }),
			track({ identity: cus2, commandId: "cmd_2", value: 1 }),
		]);
		expect(decider.drainStats?.()).toEqual({
			tracks: 0,
			checks: 0,
			trackBatches: 1,
			batchItems: 2,
			fallbackTracks: 0,
			fallbackChecks: 0,
			fallbackBatches: { lock: 1, not_resident: 1, malformed: 1 },
		});
		expect(decider.drainStats?.().trackBatches).toBe(0);
	});

	test("a batch's writes go out in one append even past the writer's batch size, and never share one with an earlier cut", async () => {
		const log = heldAppender();
		const board = createPositionBoard({ config: { partitionCount: 1 } });
		const processor = await createResidentProcessor({
			states,
			appender: log.appender,
			positions: board.sinkFor({ partition: 0 }),
			config: {
				writerLimits: {
					maxBatchSize: 2,
					maxPendingCommands: 1_000,
					maxPendingCommandsPerCustomer: 1_000,
				},
			},
		});
		await settled();
		log.sizes.length = 0;
		log.hold();
		const decider = createHotDecider({
			ctx: contextFor({ processor }),
			config: { partitionCount: 1 },
		});
		// One write on the wire, one queued ahead of the batch.
		processor.trackHot({ command: track({ identity: cus2, commandId: "w1" }) });
		await settled();
		processor.trackHot({ command: track({ identity: cus2, commandId: "w2" }) });
		const commands = ["b1", "b2", "b3", "b4", "b5"].map((commandId) =>
			track({ identity: cus1, commandId, value: 1 }),
		);
		const outcome = decider.decide({
			kind: HOT_KIND.TRACK_BATCH,
			body: encoder.encode(batchBody({ commands })),
		});
		expect(outcome?.status).toBe(200);
		log.open();
		await settled();
		expect(log.sizes).toEqual([1, 1, 5]);
		expect(board.readCommitPos({ partition: 0 })).toBe(outcome?.seq ?? -1);
	});

	test("a refused append fails the batch's held reply whole, through the failure range that covers its last write", async () => {
		const log = heldAppender();
		const board = createPositionBoard({ config: { partitionCount: 1 } });
		const failed: { seq: number; lastSeq: number }[] = [];
		board.onFailedAbove(({ seq, lastSeq }) => failed.push({ seq, lastSeq }));
		const processor = await createResidentProcessor({
			states,
			appender: log.appender,
			positions: board.sinkFor({ partition: 0 }),
		});
		await settled();
		log.hold();
		const decider = createHotDecider({
			ctx: contextFor({ processor }),
			config: { partitionCount: 1 },
		});
		const commands = ["f1", "f2", "f3"].map((commandId) =>
			track({ identity: cus1, commandId, value: 1 }),
		);
		const outcome = decider.decide({
			kind: HOT_KIND.TRACK_BATCH,
			body: encoder.encode(batchBody({ commands })),
		});
		const seq = outcome?.seq ?? 0;
		expect(seq).toBeGreaterThan(0);
		await settled();
		log.refuse(new Error("broker refused the append"));
		await settled();
		expect(failed).toHaveLength(1);
		const [range] = failed;
		expect(seq).toBeGreaterThan(range?.seq ?? Number.POSITIVE_INFINITY);
		expect(seq).toBeLessThanOrEqual(range?.lastSeq ?? 0);
		expect(board.readCommitPos({ partition: 0 })).toBeLessThan(seq);
	});
});

/** A log that records every append's size and answers them only when the test lets it. */
function heldAppender() {
	const sizes: number[] = [];
	const waiting: { settle: (cause?: unknown) => void }[] = [];
	let held = false;
	let appended = 0n;
	function append({
		outcomes,
	}: {
		outcomes: readonly MeteringRecord[];
	}): Promise<{ baseOffset: bigint }> {
		sizes.push(outcomes.length);
		return new Promise((resolve, reject) => {
			function settle(cause?: unknown): void {
				if (cause) {
					reject(cause);
					return;
				}
				const baseOffset = appended;
				appended += BigInt(outcomes.length);
				resolve({ baseOffset });
			}
			if (held) waiting.push({ settle });
			else settle();
		});
	}
	return {
		sizes,
		appender: { appendCommitted: append },
		hold() {
			held = true;
		},
		open() {
			held = false;
			for (const entry of waiting.splice(0)) entry.settle();
		},
		refuse(cause: unknown) {
			waiting.shift()?.settle(cause);
		},
	};
}

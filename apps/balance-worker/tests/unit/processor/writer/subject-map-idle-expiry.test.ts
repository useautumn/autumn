import { describe, expect, mock, test } from "bun:test";
import type { MeteringIdentity } from "@autumn/balance-engine";
import { createBalanceWorkerEnv } from "@autumn/env/balanceWorker";
import { BALANCE_WORKER_SUBJECT_IDLE_EXPIRY_MS } from "@autumn/env/balanceWorkerConstants";
import { balanceWorkerEnvToRuntimeConfig } from "../../../../src/init/workerConfig.js";
import { createPartitionWriter } from "../../../../src/processor/writer/createPartitionWriter.js";
import { createRecentCommands } from "../../../../src/processor/writer/recentCommands/createRecentCommands.js";
import {
	createSubjectMap,
	SUBJECT_MAP_IDLE_SCAN_PER_WRITE,
} from "../../../../src/processor/writer/subjectMap/createSubjectMap.js";
import { createState, testIdentity } from "../../../fixtures/mutations.js";

const idleExpiryMs = 1_000;
const state = createState();
const stateBytes = JSON.stringify(state).length;

function createClock() {
	let at = 0;
	return {
		now: () => at,
		advanceBy: ({ ms }: { ms: number }) => {
			at += ms;
		},
	};
}

function createIdleExpiringMap() {
	const clock = createClock();
	const onEvicted = mock(() => undefined);
	const map = createSubjectMap({ idleExpiryMs, now: clock.now, onEvicted });
	const write = ({ subjectKey }: { subjectKey: string }) =>
		map.setState({ subjectKey, customerKey: subjectKey, state });
	return { map, clock, onEvicted, write };
}

describe("subject map idle expiry", () => {
	test("a write drops subjects nobody has touched for longer than the idle expiry", () => {
		const { map, clock, write } = createIdleExpiringMap();
		write({ subjectKey: "a" });
		write({ subjectKey: "b" });

		clock.advanceBy({ ms: idleExpiryMs + 1 });
		write({ subjectKey: "c" });

		expect(map.readState({ subjectKey: "a" })).toBeNull();
		expect(map.readState({ subjectKey: "b" })).toBeNull();
		expect(map.readState({ subjectKey: "c" })).toEqual(state);
		expect(map.sizeBytes()).toBe(stateBytes);
	});

	test("a subject idle for exactly the expiry stays", () => {
		const { map, clock, write } = createIdleExpiringMap();
		write({ subjectKey: "a" });

		clock.advanceBy({ ms: idleExpiryMs });
		write({ subjectKey: "b" });

		expect(map.readState({ subjectKey: "a" })).toEqual(state);
	});

	test("reading a subject keeps it resident", () => {
		const { map, clock, write } = createIdleExpiringMap();
		write({ subjectKey: "a" });
		write({ subjectKey: "b" });

		clock.advanceBy({ ms: idleExpiryMs / 2 });
		map.readState({ subjectKey: "a" });
		clock.advanceBy({ ms: idleExpiryMs / 2 + 1 });
		write({ subjectKey: "c" });

		expect(map.readState({ subjectKey: "a" })).toEqual(state);
		expect(map.readState({ subjectKey: "b" })).toBeNull();
	});

	test("a pinned subject counts as in use, and expires an idle period after the last write that found it pinned", () => {
		const { map, clock, write } = createIdleExpiringMap();
		write({ subjectKey: "a" });
		map.pin({ subjectKey: "a" });

		clock.advanceBy({ ms: idleExpiryMs + 1 });
		write({ subjectKey: "b" });
		expect(map.bytesOf({ subjectKey: "a" })).toBe(stateBytes);

		map.unpin({ subjectKey: "a" });
		write({ subjectKey: "c" });
		expect(map.bytesOf({ subjectKey: "a" })).toBe(stateBytes);

		clock.advanceBy({ ms: idleExpiryMs + 1 });
		write({ subjectKey: "d" });
		expect(map.bytesOf({ subjectKey: "a" })).toBeNull();
		expect(map.bytesOf({ subjectKey: "d" })).toBe(stateBytes);
	});

	test("pinned subjects at the front never stop idle ones behind them from expiring", () => {
		const { map, clock, write } = createIdleExpiringMap();
		const pinnedKeys = Array.from(
			{ length: SUBJECT_MAP_IDLE_SCAN_PER_WRITE },
			(_, index) => `pinned_${index}`,
		);
		for (const subjectKey of pinnedKeys) {
			write({ subjectKey });
			map.pin({ subjectKey });
		}
		write({ subjectKey: "idle" });

		clock.advanceBy({ ms: idleExpiryMs + 1 });
		write({ subjectKey: "x" });
		write({ subjectKey: "y" });

		expect(map.bytesOf({ subjectKey: "idle" })).toBeNull();
		for (const subjectKey of pinnedKeys)
			expect(map.bytesOf({ subjectKey })).toBe(stateBytes);
	});

	test("an idle drop queues no snapshot delete, since Postgres still holds the subject's rows", () => {
		const { clock, onEvicted, write } = createIdleExpiringMap();
		write({ subjectKey: "a" });

		clock.advanceBy({ ms: idleExpiryMs + 1 });
		write({ subjectKey: "b" });

		expect(onEvicted).not.toHaveBeenCalled();
	});

	test("one write drops a bounded number of idle subjects, and later writes drop the rest", () => {
		const { map, clock, write } = createIdleExpiringMap();
		const idleCount = SUBJECT_MAP_IDLE_SCAN_PER_WRITE * 2 + 1;
		for (let index = 0; index < idleCount; index++)
			write({ subjectKey: `idle_${index}` });

		clock.advanceBy({ ms: idleExpiryMs + 1 });
		write({ subjectKey: "x" });
		expect(map.sizeBytes()).toBe(
			(idleCount - SUBJECT_MAP_IDLE_SCAN_PER_WRITE + 1) * stateBytes,
		);

		write({ subjectKey: "y" });
		write({ subjectKey: "z" });
		expect(map.sizeBytes()).toBe(3 * stateBytes);
	});

	test("without an idle expiry a subject stays however long it sits", () => {
		const clock = createClock();
		const map = createSubjectMap({ now: clock.now });
		map.setState({ subjectKey: "a", customerKey: "a", state });

		clock.advanceBy({ ms: 365 * 24 * 60 * 60 * 1000 });
		map.setState({ subjectKey: "b", customerKey: "b", state });

		expect(map.readState({ subjectKey: "a" })).toEqual(state);
	});
});

describe("partition writer idle expiry", () => {
	test("a writer given an idle expiry drops subjects idle past it on its next write", () => {
		const clock = createClock();
		const writer = createPartitionWriter({
			ctx: {
				stateStore: {
					baseline: "map",
					readState: () => null,
					readOwnState: () => null,
					readReceipt: () => null,
					applyDurableMutations: async () => [],
				},
				appender: { appendCommitted: async () => ({ baseOffset: 0n }) },
				receiptPolicy: { retentionMs: 60_000, now: () => 1_700_000_000_000 },
				recentCommands: createRecentCommands({
					windowMs: 600_000,
					now: () => 0,
				}),
				now: clock.now,
			},
			config: {
				topic: "autumn-metering",
				partition: 0,
				limits: {
					maxBatchSize: 100,
					maxPendingCommands: 100,
					maxPendingCommandsPerCustomer: 10,
					subjectIdleExpiryMs: idleExpiryMs,
				},
			},
		});
		const idleIdentity = testIdentity;
		const activeIdentity: MeteringIdentity = {
			...testIdentity,
			customerId: "cus_2",
		};
		writer.adopt({ state: createState({ identity: idleIdentity }) });

		clock.advanceBy({ ms: idleExpiryMs + 1 });
		writer.adopt({ state: createState({ identity: activeIdentity }) });

		expect(writer.readFreshestState({ identity: idleIdentity })).toBeNull();
		expect(
			writer.readFreshestState({ identity: activeIdentity }),
		).not.toBeNull();
	});

	test("a deployed worker's writers drop subjects idle past the worker's idle expiry", () => {
		const config = balanceWorkerEnvToRuntimeConfig({
			env: createBalanceWorkerEnv({
				DATABASE_URL: "postgres://worker:secret@127.0.0.1:1/never",
				KAFKA_BROKERS: "broker:9098",
				KAFKA_AUTH_MODE: "none",
				AWS_REGION: "us-east-1",
			}),
			endpoint: "http://127.0.0.1:8082",
		});

		expect(config.writerLimits.subjectIdleExpiryMs).toBe(
			BALANCE_WORKER_SUBJECT_IDLE_EXPIRY_MS,
		);
	});
});

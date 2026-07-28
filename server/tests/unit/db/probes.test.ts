import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { DbProbe } from "@/db/probes/types.js";

const info = mock((..._args: unknown[]) => {});
const warn = mock((..._args: unknown[]) => {});
mock.module("@/external/logtail/logtailUtils.js", () => ({
	logger: {
		info,
		warn,
		error: mock(() => {}),
		debug: mock(() => {}),
		child: () => ({}),
	},
}));

const { runDbProbes } = await import("@/db/probes/runDbProbes.js");
const { longTxnProbe } = await import("@/db/probes/longTxnProbe.js");
const { replicationSlotProbe } = await import(
	"@/db/probes/replicationSlotProbe.js"
);

// biome-ignore lint/suspicious/noExplicitAny: probes ignore the db in these tests
const fakeDb = {} as any;

beforeEach(() => {
	info.mockClear();
	warn.mockClear();
});

describe("runDbProbes", () => {
	it("isolates a throwing probe: others still run, error is logged", async () => {
		const ran: string[] = [];
		const good: DbProbe = {
			name: "good",
			run: async () => {
				ran.push("good");
			},
		};
		const bad: DbProbe = {
			name: "bad",
			run: async () => {
				throw new Error("boom");
			},
		};

		await runDbProbes({ db: fakeDb, probes: [bad, good] });

		expect(ran).toEqual(["good"]);
		expect(warn).toHaveBeenCalledTimes(1);
		expect(warn.mock.calls[0][0]).toMatchObject({
			type: "db_probe_error",
			probe: "bad",
		});
	});

	it("bounds a hung probe with a timeout instead of hanging forever", async () => {
		const hung: DbProbe = {
			name: "hung",
			run: () => new Promise<void>(() => {}),
		};

		const start = Date.now();
		await runDbProbes({ db: fakeDb, probes: [hung], timeoutMs: 30 });

		expect(Date.now() - start).toBeLessThan(2000);
		expect(warn).toHaveBeenCalledTimes(1);
		expect(warn.mock.calls[0][0]).toMatchObject({
			type: "db_probe_error",
			probe: "hung",
		});
	});

	it("single-flights: a concurrent tick is skipped while one is in flight", async () => {
		let runs = 0;
		const slow: DbProbe = {
			name: "slow",
			run: async () => {
				runs++;
				await new Promise((r) => setTimeout(r, 40));
			},
		};

		await Promise.all([
			runDbProbes({ db: fakeDb, probes: [slow] }),
			runDbProbes({ db: fakeDb, probes: [slow] }),
		]);

		expect(runs).toBe(1);
		expect(info).toHaveBeenCalledWith(
			{ type: "db_probes_skipped" },
			expect.any(String),
		);
	});
});

describe("longTxnProbe", () => {
	it("emits db_long_txn with query_kind and never logs raw query text", async () => {
		const db = {
			execute: async () => [
				{
					longest_txn_seconds: 42,
					xmin_lag: 123,
					pid: 999,
					wait_event: "on_cpu",
					query_kind: "UPDATE",
					visible_backends: 60,
				},
			],
			// biome-ignore lint/suspicious/noExplicitAny: minimal db stub
		} as any;

		await longTxnProbe.run({ db });

		expect(info).toHaveBeenCalledTimes(1);
		const [fields] = info.mock.calls[0];
		expect(fields).toMatchObject({
			type: "db_long_txn",
			blind: false,
			longest_txn_seconds: 42,
			xmin_lag: 123,
			pid: 999,
			wait_event: "on_cpu",
			query_kind: "UPDATE",
		});
		expect(fields).not.toHaveProperty("query");
	});

	it("marks blind readings with null metrics so they can't look healthy", async () => {
		const db = {
			execute: async () => [
				{
					longest_txn_seconds: 0,
					xmin_lag: 0,
					pid: null,
					wait_event: null,
					query_kind: null,
					visible_backends: 1,
				},
			],
			// biome-ignore lint/suspicious/noExplicitAny: minimal db stub
		} as any;

		await longTxnProbe.run({ db });

		expect(warn).toHaveBeenCalledTimes(1);
		expect(warn.mock.calls[0][0]).toMatchObject({
			type: "db_long_txn_blind",
			visible_backends: 1,
		});
		const [fields] = info.mock.calls[0];
		expect(fields).toMatchObject({
			type: "db_long_txn",
			blind: true,
			longest_txn_seconds: null,
			xmin_lag: null,
		});
	});

	it("treats an empty result as blind (no fake-healthy zero)", async () => {
		// biome-ignore lint/suspicious/noExplicitAny: minimal db stub
		const db = { execute: async () => [] } as any;

		await longTxnProbe.run({ db });

		expect(warn).toHaveBeenCalledTimes(1);
		expect(warn.mock.calls[0][0]).toMatchObject({
			type: "db_long_txn_blind",
			visible_backends: 0,
		});
		const [fields] = info.mock.calls[0];
		expect(fields).toMatchObject({
			type: "db_long_txn",
			blind: true,
			longest_txn_seconds: null,
			xmin_lag: null,
		});
	});
});

describe("replicationSlotProbe", () => {
	const slotRow = (overrides: Record<string, unknown> = {}) => ({
		in_recovery: false,
		slot_name: "rw_slot",
		slot_type: "logical",
		active: true,
		failover: true,
		wal_status: "reserved",
		confirmed_flush_lsn: "D9C/512A62A0",
		retained_wal_bytes: "1048576",
		...overrides,
	});

	const findCall = (type: string) =>
		info.mock.calls.find(
			(call) => (call[0] as { type?: string }).type === type,
		)?.[0] as Record<string, unknown> | undefined;

	it("emits a line per slot plus a summary naming every slot", async () => {
		const db = {
			execute: async () => [
				slotRow(),
				slotRow({ slot_name: "tinybird_slot", failover: false }),
			],
			// biome-ignore lint/suspicious/noExplicitAny: minimal db stub
		} as any;

		await replicationSlotProbe.run({ db });

		expect(findCall("db_replication_slots")).toMatchObject({
			blind: false,
			in_recovery: false,
			slot_count: 2,
			slot_names: "rw_slot,tinybird_slot",
		});

		const slotLines = info.mock.calls
			.map((call) => call[0] as Record<string, unknown>)
			.filter((fields) => fields.type === "db_replication_slot");
		expect(slotLines).toHaveLength(2);
		expect(slotLines[0]).toMatchObject({
			blind: false,
			slot_name: "rw_slot",
			slot_type: "logical",
			active: true,
			failover: true,
			wal_status: "reserved",
			confirmed_flush_lsn: "D9C/512A62A0",
			retained_wal_bytes: 1_048_576,
		});
		expect(slotLines[1]).toMatchObject({
			slot_name: "tinybird_slot",
			failover: false,
		});
	});

	it("warns when a primary reports no slots at all", async () => {
		const db = {
			execute: async () => [
				slotRow({
					slot_name: null,
					slot_type: null,
					active: null,
					failover: null,
					wal_status: null,
					confirmed_flush_lsn: null,
					retained_wal_bytes: null,
				}),
			],
			// biome-ignore lint/suspicious/noExplicitAny: minimal db stub
		} as any;

		await replicationSlotProbe.run({ db });

		expect(warn).toHaveBeenCalledTimes(1);
		expect(warn.mock.calls[0][0]).toMatchObject({
			type: "db_replication_slots_empty",
		});
		expect(findCall("db_replication_slots")).toMatchObject({
			blind: false,
			slot_count: 0,
			slot_names: "",
		});
		expect(findCall("db_replication_slot")).toBeUndefined();
	});

	it("marks a standby reading blind so its slots can't look authoritative", async () => {
		const db = {
			execute: async () => [
				slotRow({ in_recovery: true, retained_wal_bytes: null }),
			],
			// biome-ignore lint/suspicious/noExplicitAny: minimal db stub
		} as any;

		await replicationSlotProbe.run({ db });

		expect(warn).toHaveBeenCalledTimes(1);
		expect(warn.mock.calls[0][0]).toMatchObject({
			type: "db_replication_slots_blind",
			in_recovery: true,
		});
		expect(findCall("db_replication_slots")).toMatchObject({ blind: true });
		expect(findCall("db_replication_slot")).toMatchObject({
			blind: true,
			retained_wal_bytes: null,
		});
	});

	it("treats an empty result as blind rather than zero healthy slots", async () => {
		// biome-ignore lint/suspicious/noExplicitAny: minimal db stub
		const db = { execute: async () => [] } as any;

		await replicationSlotProbe.run({ db });

		expect(warn).toHaveBeenCalledTimes(1);
		expect(warn.mock.calls[0][0]).toMatchObject({
			type: "db_replication_slots_blind",
		});
		expect(findCall("db_replication_slots")).toMatchObject({
			blind: true,
			in_recovery: null,
			slot_count: 0,
		});
	});
});

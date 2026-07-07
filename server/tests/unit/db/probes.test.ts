import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { DbProbe } from "@/db/probes/types.js";

// Mock the logger before importing the SUT so probe emits are captured, not shipped.
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
	it("emits db_long_txn and never logs raw query text", async () => {
		const db = {
			execute: async () => [
				{
					longest_txn_seconds: 42,
					max_xmin_lag: 123,
					pid: 999,
					wait_event: "on_cpu",
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
			longest_txn_seconds: 42,
			max_xmin_lag: 123,
			pid: 999,
			wait_event: "on_cpu",
		});
		expect(fields).not.toHaveProperty("query");
	});

	it("defaults to zeros on an empty result", async () => {
		// biome-ignore lint/suspicious/noExplicitAny: minimal db stub
		const db = { execute: async () => [] } as any;

		await longTxnProbe.run({ db });

		const [fields] = info.mock.calls[0];
		expect(fields).toMatchObject({
			type: "db_long_txn",
			longest_txn_seconds: 0,
			max_xmin_lag: 0,
			pid: null,
		});
	});

	it("warns when it can see <=1 backend (missing pg_monitor visibility)", async () => {
		const db = {
			execute: async () => [
				{
					longest_txn_seconds: 0,
					max_xmin_lag: 0,
					pid: null,
					wait_event: null,
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
	});
});

import { Database } from "bun:sqlite";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { SubjectState } from "@autumn/balance-engine";
import { testIdentity } from "../../fixtures/mutations.js";
import { scenarios } from "../track-throughput/scenarios.js";

/**
 * Spike: can several processes track against shared SQLite slot files, and how fast?
 * Runs N worker processes for a fixed time, then checks that not one deduction was lost.
 */
const args = Object.fromEntries(
	process.argv.slice(2).map((arg) => {
		const [key, value] = arg.replace(/^--/, "").split("=");
		return [key, value ?? "true"];
	}),
);
const mode = args.mode ?? "locked";
const processes = Number(args.processes ?? 4);
const slots = Number(args.slots ?? 128);
const customersPerSlot = Number(args.customersPerSlot ?? 100);
const durationMs = Number(args.durationMs ?? 3000);
const scenarioName = args.scenario ?? "typical";
const scenario = scenarios[scenarioName];
if (!scenario) throw new Error(`Unknown scenario ${scenarioName}`);
const dir = args.dir ?? "/tmp/atom-slot-contention";
const INITIAL_BALANCE = 1_000_000_000;

rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
let rowBytes = 0;
for (let slot = 0; slot < slots; slot++) {
	const db = new Database(join(dir, `slot-${slot}.sqlite`), { create: true });
	db.exec("PRAGMA journal_mode = WAL");
	db.exec("PRAGMA synchronous = NORMAL");
	db.exec(
		"CREATE TABLE subject_states (customer_id TEXT PRIMARY KEY, revision INTEGER NOT NULL, state TEXT NOT NULL) WITHOUT ROWID",
	);
	const insert = db.prepare(
		"INSERT INTO subject_states (customer_id, revision, state) VALUES (?, 0, ?)",
	);
	db.transaction(() => {
		for (let i = 0; i < customersPerSlot; i++) {
			const customerId = `cus_${slot}_${i}`;
			const state = JSON.stringify(
				scenario.stateFor({ identity: { ...testIdentity, customerId } }),
			);
			rowBytes = state.length;
			insert.run(customerId, state);
		}
	})();
	db.close();
}

const startAt = Date.now() + 1500;
const workers = Array.from({ length: processes }, (_, worker) =>
	Bun.spawn(
		[
			"bun",
			"--config=./bunfig.toml",
			join(import.meta.dir, "worker.ts"),
			`--mode=${mode}`,
			`--dir=${dir}`,
			`--slots=${slots}`,
			`--customersPerSlot=${customersPerSlot}`,
			`--durationMs=${durationMs}`,
			`--scenario=${scenarioName}`,
			`--worker=${worker}`,
			`--processes=${processes}`,
			`--ownership=${args.ownership ?? "shared"}`,
			`--startAt=${startAt}`,
		],
		{ stdout: "pipe", stderr: "inherit" },
	),
);
const reports = await Promise.all(
	workers.map(async (worker) => {
		const output = await new Response(worker.stdout).text();
		if ((await worker.exited) !== 0) throw new Error("A worker failed");
		return JSON.parse(output.trim().split("\n").at(-1) ?? "{}") as {
			tracks: number;
			retries: number;
			p50Micros: number;
			p99Micros: number;
		};
	}),
);

// Every track deducts exactly 1 from one balance row, so what is missing from the rows must equal the tracks made.
let deducted = 0;
for (let slot = 0; slot < slots; slot++) {
	const db = new Database(join(dir, `slot-${slot}.sqlite`));
	for (const { state } of db
		.query<{ state: string }, []>("SELECT state FROM subject_states")
		.all()) {
		for (const row of (JSON.parse(state) as SubjectState).customerEntitlements)
			deducted += INITIAL_BALANCE - Number(row.balance);
	}
	db.close();
}

const tracks = reports.reduce((sum, report) => sum + report.tracks, 0);
const worst = (field: "p50Micros" | "p99Micros") =>
	Math.max(...reports.map((report) => report[field]));
console.log(
	JSON.stringify({
		mode,
		ownership: args.ownership ?? "shared",
		scenario: scenarioName,
		rowBytes,
		processes,
		slots,
		customersPerSlot,
		tracksPerSecond: Math.round((tracks / durationMs) * 1000),
		perProcess: Math.round((tracks / durationMs / processes) * 1000),
		p50Micros: worst("p50Micros"),
		p99Micros: worst("p99Micros"),
		retries: reports.reduce((sum, report) => sum + report.retries, 0),
		lostUpdates: tracks - deducted,
	}),
);
rmSync(dir, { recursive: true, force: true });

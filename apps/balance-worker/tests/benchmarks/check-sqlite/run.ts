import { Database } from "bun:sqlite";
import { mkdirSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import { performance } from "node:perf_hooks";
import {
	catalogRowsToCatalog,
	computeCheck,
	parseCheckCommand,
	type SubjectState,
	subjectStateToFullSubject,
} from "@autumn/balance-engine";
import { Hono } from "hono";
import { testIdentity, testOrg } from "../../fixtures/mutations.js";
import { scenarios } from "../track-throughput/scenarios.js";

/** A check answered straight off a SQLite file: one row read, one engine check, nothing resident between requests. */
const args = Object.fromEntries(
	process.argv.slice(2).map((arg) => {
		const [key, value] = arg.replace(/^--/, "").split("=");
		return [key, value ?? "true"];
	}),
);
const scenario = scenarios[args.scenario ?? "typical"];
if (!scenario) throw new Error(`Unknown scenario ${args.scenario}`);
const customers = Number(args.customers ?? 20_000);
const total = Number(args.total ?? 100_000);
const warmup = Number(args.warmup ?? 5_000);
const file = args.file ?? "/tmp/byoc-check-bench/slot-000.sqlite";
/** core: read + engine only; hono: the same behind a Hono route, JSON in and out, no socket. */
const mode = args.mode ?? "core";

mkdirSync(dirname(file), { recursive: true });
for (const suffix of ["", "-wal", "-shm"])
	rmSync(`${file}${suffix}`, { force: true });
const db = new Database(file, { create: true });
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA synchronous = NORMAL");
db.exec(
	"CREATE TABLE subject_states (customer_id TEXT PRIMARY KEY, state TEXT NOT NULL) WITHOUT ROWID",
);

const insert = db.prepare(
	"INSERT INTO subject_states (customer_id, state) VALUES (?, ?)",
);
let rowBytes = 0;
db.transaction(() => {
	for (let i = 0; i < customers; i++) {
		const customerId = `cus_${i}`;
		const state = JSON.stringify(
			scenario.stateFor({ identity: { ...testIdentity, customerId } }),
		);
		rowBytes = state.length;
		insert.run(customerId, state);
	}
})();

// The catalog is the org's, not a customer's: one parsed copy serves every check.
const catalog = catalogRowsToCatalog({ rows: scenario.catalogRows });
const select = db.prepare<{ state: string }, [string]>(
	"SELECT state FROM subject_states WHERE customer_id = ?",
);

const phases = { read: 0, parse: 0, subject: 0, check: 0 };
const checkFromFile = ({
	customerId,
	featureId,
	requiredBalance,
}: {
	customerId: string;
	featureId: string;
	requiredBalance: number;
}): boolean => {
	const startedAt = performance.now();
	const row = select.get(customerId);
	if (!row) throw new Error(`No row for ${customerId}`);
	const readAt = performance.now();
	const state = JSON.parse(row.state) as SubjectState;
	const parsedAt = performance.now();
	const fullSubject = subjectStateToFullSubject({
		state,
		catalog,
		entityId: null,
	});
	const subjectAt = performance.now();
	const command = parseCheckCommand({
		input: {
			schemaVersion: 1,
			type: "check",
			org: testOrg,
			requestId: "req_bench",
			identity: { ...testIdentity, customerId },
			featureId,
			internalFeatureId: `feat_${featureId}`,
			requiredBalance,
			properties: null,
			occurredAt: Date.now(),
		},
	});
	const { allowed } = computeCheck({ fullSubject, command });
	const checkedAt = performance.now();
	phases.read += readAt - startedAt;
	phases.parse += parsedAt - readAt;
	phases.subject += subjectAt - parsedAt;
	phases.check += checkedAt - subjectAt;
	return allowed;
};

const app = new Hono().post("/check", async (c) => {
	const body = await c.req.json<{
		customer_id: string;
		feature_id: string;
		required_balance: number;
	}>();
	const allowed = checkFromFile({
		customerId: body.customer_id,
		featureId: body.feature_id,
		requiredBalance: body.required_balance,
	});
	return c.json({ allowed });
});

const checkOnce = async (index: number): Promise<void> => {
	const customerId = `cus_${(index * 7919) % customers}`;
	const featureId = scenario.features[index % scenario.features.length];
	if (mode === "core") {
		if (!checkFromFile({ customerId, featureId, requiredBalance: 1 }))
			throw new Error("check refused");
		return;
	}
	const response = await app.request("/check", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			customer_id: customerId,
			feature_id: featureId,
			required_balance: 1,
		}),
	});
	const { allowed } = (await response.json()) as { allowed: boolean };
	if (!allowed) throw new Error("check refused");
};

for (let i = 0; i < warmup; i++) await checkOnce(i);
for (const phase of Object.keys(phases) as (keyof typeof phases)[])
	phases[phase] = 0;

const latencies = new Float64Array(total);
const startedAt = performance.now();
for (let i = 0; i < total; i++) {
	const before = performance.now();
	await checkOnce(warmup + i);
	latencies[i] = performance.now() - before;
}
const elapsedMs = performance.now() - startedAt;
latencies.sort();

const micros = (ms: number) => Math.round(ms * 1000);
const percentile = (p: number) =>
	micros(latencies[Math.min(total - 1, Math.floor(total * p))]);
console.log(
	JSON.stringify({
		scenario: scenario.name,
		mode,
		customers,
		rowBytes,
		checksPerSecond: Math.round((total / elapsedMs) * 1000),
		avgMicros: micros(elapsedMs / total),
		p50Micros: percentile(0.5),
		p99Micros: percentile(0.99),
		phaseMicros: {
			read: micros(phases.read / total),
			parse: micros(phases.parse / total),
			subject: micros(phases.subject / total),
			check: micros(phases.check / total),
		},
	}),
);
db.close();

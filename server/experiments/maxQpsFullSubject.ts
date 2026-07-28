// Max-QPS checker for getFullSubject, prepared vs unprepared.
//
//   ENV_FILE=.env infisical run --env=dev --recursive -- \
//     bun experiments/maxQpsFullSubject.ts [secondsPerStep]
//
// Arms are interleaved at each concurrency step so CPU-credit throttling on a
// burstable instance penalises both equally. Absolute QPS is only meaningful
// relative to the box it ran on; the prepared/unprepared RATIO is the output
// that transfers.
import { AppEnv } from "@autumn/shared";
import { drizzle } from "drizzle-orm/node-postgres";
import { PgDialect } from "drizzle-orm/pg-core";
import pg from "pg";
import { executePrepared } from "../src/db/executePrepared.js";
import { getFullSubjectQuery } from "../src/internal/customers/repos/getFullSubject/getFullSubjectQuery.js";

const SECONDS_PER_STEP = Number(process.argv[2]) || 5;
const CONCURRENCIES = [1, 2, 4, 8, 16, 32];

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");

const dialect = new PgDialect();
const pool = new pg.Pool({ connectionString: url, max: 40 });
// The prepared arm runs through the real production helper, not a hand-rolled
// pool.query, so this benchmarks the shipped code path.
const db = drizzle({ client: pool }) as never;

const { rows: subjects } = await pool.query<{ id: string; org_id: string }>(
	`SELECT id, org_id FROM customers WHERE internal_id LIKE 'bench_%' ORDER BY id LIMIT 100`,
);
if (subjects.length === 0) {
	throw new Error("No bench_ customers found — run seedBenchCustomers.ts first");
}

const compile = (orgId: string, customerId: string) =>
	dialect.sqlToQuery(
		getFullSubjectQuery({ orgId, env: AppEnv.Sandbox, customerId }),
	);

/** Confirms every subject compiles to the same SQL text — required to prepare. */
const texts = new Set(subjects.map((s) => compile(s.org_id, s.id).sql));
if (texts.size !== 1) {
	throw new Error(`SQL text is not stable: ${texts.size} distinct variants`);
}

const percentile = (sorted: number[], p: number) =>
	sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;

const runArm = async ({
	prepared,
	concurrency,
}: {
	prepared: boolean;
	concurrency: number;
}) => {
	const deadline = Date.now() + SECONDS_PER_STEP * 1000;
	const latencies: number[] = [];
	let index = 0;
	let errors = 0;

	const worker = async () => {
		while (Date.now() < deadline) {
			const subject = subjects[index++ % subjects.length];
			const query = getFullSubjectQuery({
				orgId: subject.org_id,
				env: AppEnv.Sandbox,
				customerId: subject.id,
			});
			const start = performance.now();
			try {
				if (prepared) {
					await executePrepared({ db, label: "getFullSubject", query });
				} else {
					const { sql: text, params } = dialect.sqlToQuery(query);
					await pool.query({ text, values: params as unknown[] });
				}
				latencies.push(performance.now() - start);
			} catch (error) {
				errors++;
				if (errors === 1) console.error("  first error:", error);
			}
		}
	};

	const startedAt = Date.now();
	await Promise.all(Array.from({ length: concurrency }, worker));
	const elapsedSeconds = (Date.now() - startedAt) / 1000;

	latencies.sort((a, b) => a - b);
	return {
		qps: latencies.length / elapsedSeconds,
		p50: percentile(latencies, 0.5),
		p99: percentile(latencies, 0.99),
		count: latencies.length,
		errors,
	};
};

console.log(
	`subjects=${subjects.length}  sql=${[...texts][0].length} chars  ` +
		`${SECONDS_PER_STEP}s/step\n`,
);
console.log(
	"conc |        unprepared QPS  p50    p99 |          prepared QPS  p50    p99 | speedup",
);
console.log("-".repeat(104));

for (const concurrency of CONCURRENCIES) {
	// Interleave: cold arm first each step, so neither gets a cache advantage.
	const plain = await runArm({ prepared: false, concurrency });
	const prep = await runArm({ prepared: true, concurrency });

	const speedup = plain.qps > 0 ? prep.qps / plain.qps : 0;
	console.log(
		`${String(concurrency).padStart(4)} | ` +
			`${plain.qps.toFixed(1).padStart(20)} ${plain.p50.toFixed(1).padStart(6)} ${plain.p99.toFixed(1).padStart(6)} | ` +
			`${prep.qps.toFixed(1).padStart(20)} ${prep.p50.toFixed(1).padStart(6)} ${prep.p99.toFixed(1).padStart(6)} | ` +
			`${speedup.toFixed(2)}×${plain.errors + prep.errors > 0 ? `  (${plain.errors + prep.errors} errors)` : ""}`,
	);
}

await pool.end();

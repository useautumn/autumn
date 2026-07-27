// Proves executePrepared() creates a real server-side named prepared statement,
// by pinning the pool to one connection and reading pg_prepared_statements.
//
//   ENV_FILE=.env infisical run --env=dev --recursive -- \
//     bun experiments/verifyPreparedStatements.ts
import { AppEnv } from "@autumn/shared";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import {
	executePrepared,
	preparedStatementNames,
} from "../src/db/executePrepared.js";
import { getFullSubjectQuery } from "../src/internal/customers/repos/getFullSubject/getFullSubjectQuery.js";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");

// max:1 so every statement lands on the same backend we then inspect.
const pool = new pg.Pool({ connectionString: url, max: 1 });
const db = drizzle({ client: pool }) as never;

const { rows: subjects } = await pool.query<{ id: string; org_id: string }>(
	`SELECT id, org_id FROM customers WHERE internal_id LIKE 'bench_%' ORDER BY id LIMIT 3`,
);
if (subjects.length === 0) throw new Error("run seedBenchCustomers.ts first");

const run = async (subject: { id: string; org_id: string }) => {
	const started = performance.now();
	const rows = await executePrepared({
		db,
		label: "getFullSubject",
		query: getFullSubjectQuery({
			orgId: subject.org_id,
			env: AppEnv.Sandbox,
			customerId: subject.id,
		}),
	});
	return { ms: performance.now() - started, rows: rows.length };
};

// Postgres only considers a generic plan after 5 executions of a prepared
// statement — until then it re-plans per call and we save parsing only. Run
// well past that threshold so we can see whether it actually switches.
console.log("Executing getFullSubject through executePrepared()...\n");
for (let call = 1; call <= 12; call++) {
	const subject = subjects[call % subjects.length];
	const { ms, rows } = await run(subject);
	console.log(
		`  call ${String(call).padStart(2)} (${subject.id}): ${ms.toFixed(1)}ms, ${rows} row(s)`,
	);
}

console.log("\nNames minted in-process:", preparedStatementNames());

const { rows: serverSide } = await pool.query<{
	name: string;
	generic_plans: string;
	custom_plans: string;
	calls: string;
}>(
	`SELECT name, generic_plans, custom_plans, (generic_plans + custom_plans) AS calls
	 FROM pg_prepared_statements ORDER BY name`,
);

console.log("\npg_prepared_statements on this backend:");
if (serverSide.length === 0) {
	console.log("  (none) — NOT prepared server-side");
	process.exit(1);
}
for (const row of serverSide) {
	console.log(
		`  ${row.name}  calls=${row.calls}  generic=${row.generic_plans}  custom=${row.custom_plans}`,
	);
}

console.log("\nPREPARED — statement is live on the server");
await pool.end();

// Verifies getFullSubject emits identical SQL text regardless of how many
// statuses / feature ids a caller passes — the precondition for reusing it as a
// named prepared statement. Run: bun run experiments/checkFullSubjectSqlStability.ts
import { AppEnv, CusProductStatus } from "@autumn/shared";
import { PgDialect } from "drizzle-orm/pg-core";
import { getFullSubjectQuery } from "../src/internal/customers/repos/getFullSubject/getFullSubjectQuery.js";

const dialect = new PgDialect();

const compile = (inStatuses: CusProductStatus[]) =>
	dialect.sqlToQuery(
		getFullSubjectQuery({
			orgId: "org_x",
			env: AppEnv.Live,
			customerId: "cus_x",
			inStatuses,
		}),
	);

const cases: Array<{ label: string; statuses: CusProductStatus[] }> = [
	{ label: "1 status", statuses: [CusProductStatus.Active] },
	{
		label: "2 statuses",
		statuses: [CusProductStatus.Active, CusProductStatus.PastDue],
	},
	{
		label: "3 statuses",
		statuses: [
			CusProductStatus.Active,
			CusProductStatus.PastDue,
			CusProductStatus.Scheduled,
		],
	},
];

const compiled = cases.map(({ label, statuses }) => ({
	label,
	...compile(statuses),
}));

const [first, ...rest] = compiled;
let stable = true;

for (const other of rest) {
	const same = other.sql === first.sql;
	if (!same) stable = false;
	console.log(
		`${first.label} vs ${other.label}: text ${same ? "IDENTICAL" : "DIFFERS"} ` +
			`(params ${first.params.length} vs ${other.params.length})`,
	);
}

console.log(`\nSQL length: ${first.sql.length} chars`);
console.log(`Placeholders: $1..$${first.params.length}`);
console.log(stable ? "\nSTABLE — preparable" : "\nUNSTABLE — not preparable");
process.exit(stable ? 0 : 1);

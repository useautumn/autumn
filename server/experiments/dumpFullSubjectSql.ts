// Dump the getFullSubject SQL with params inlined, for EXPLAIN ANALYZE.
// Run: bun run experiments/dumpFullSubjectSql.ts <orgId> <customerId>
import { PgDialect } from "drizzle-orm/pg-core";
import { AppEnv } from "@autumn/shared";
import { getFullSubjectQuery } from "../src/internal/customers/repos/getFullSubject/getFullSubjectQuery.js";

const [orgId, customerId] = process.argv.slice(2);

const query = getFullSubjectQuery({
	orgId,
	env: AppEnv.Live,
	customerId,
});

const { sql, params } = new PgDialect().sqlToQuery(query);

const literal = (value: unknown): string => {
	if (value === null || value === undefined) return "NULL";
	if (typeof value === "number" || typeof value === "boolean") return `${value}`;
	return `'${String(value).replace(/'/g, "''")}'`;
};

// $1..$n -> literals. Descending index order so $10 isn't clobbered by $1.
let inlined = sql;
for (let i = params.length; i >= 1; i--) {
	inlined = inlined.replaceAll(`$${i}`, literal(params[i - 1]));
}

console.log(inlined);

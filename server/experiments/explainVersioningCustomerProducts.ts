import { AppEnv } from "@autumn/shared";
import { sql } from "drizzle-orm";
import { initDrizzle } from "../src/db/initDrizzle";
import {
	buildBoundedVersioningCustomerProductsQuery,
	buildVersioningCustomerProductsQuery,
} from "../src/internal/customers/cusProducts/repos/getVersioningUsage";

const STATEMENT_TIMEOUT_MS = 30_000;
const STAGING_BRANCH_ID = "zg829hpzvvkc";

const requireEnv = ({ key }: { key: string }) => {
	const value = process.env[key];
	if (!value) throw new Error(`${key} env var is required`);
	return value;
};

const dbUrl = requireEnv({ key: "EXPLAIN_DATABASE_URL" });
if (!dbUrl.includes(STAGING_BRANCH_ID)) {
	throw new Error("EXPLAIN_DATABASE_URL is not the prod-copy staging branch");
}

const orgId = requireEnv({ key: "EXPLAIN_ORG_ID" });
const planId = requireEnv({ key: "EXPLAIN_PLAN_ID" });
const env = requireEnv({ key: "EXPLAIN_ENV" }) as AppEnv;
const analyze = process.argv.includes("--analyze");
const bounded = process.argv.includes("--bounded");
const { db, client } = initDrizzle({ databaseUrl: dbUrl, maxConnections: 2 });

const withStatementTimeout = async <T>({
	run,
}: {
	run: (tx: typeof db) => Promise<T>;
}) =>
	db.transaction(async (tx) => {
		await tx.execute(
			sql.raw(`SET LOCAL statement_timeout = ${STATEMENT_TIMEOUT_MS}`),
		);
		return run(tx as unknown as typeof db);
	});

const main = async () => {
	const products = await withStatementTimeout({
		run: (tx) =>
			tx.execute<{ internal_id: string }>(sql`
				SELECT internal_id
				FROM products
				WHERE org_id = ${orgId}
					AND env = ${env}
					AND id = ${planId}
				ORDER BY version
			`),
	});
	const internalProductIds = products.map((product) => product.internal_id);
	if (internalProductIds.length === 0) {
		throw new Error("No staging product versions matched the supplied plan");
	}
	console.log(`product versions: ${internalProductIds.length}`);

	const query = bounded
		? buildBoundedVersioningCustomerProductsQuery({ internalProductIds })
		: buildVersioningCustomerProductsQuery({
				db,
				internalProductIds,
			}).getSQL();
	console.log(`mode: ${bounded ? "bounded" : "exact"}`);
	const plan = await withStatementTimeout({
		run: (tx) =>
			tx.execute(
				analyze
					? sql`EXPLAIN (ANALYZE, BUFFERS, VERBOSE, FORMAT TEXT) ${query}`
					: sql`EXPLAIN (VERBOSE, FORMAT TEXT) ${query}`,
			),
	});

	for (const row of plan) {
		console.log((row as Record<string, unknown>)["QUERY PLAN"]);
	}
};

await main().finally(() => client.end());

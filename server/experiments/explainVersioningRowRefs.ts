import type { AppEnv } from "@autumn/shared";
import { sql, type SQL } from "drizzle-orm";
import { buildBoundedVersionableRowRefsQuery } from "../src/internal/customers/cusProducts/repos/getBoundedVersionableRowRefs";
import {
	buildVersionableEntitlementRefsQuery,
	buildVersionablePriceRefsQuery,
} from "../src/internal/customers/cusProducts/repos/getVersioningUsage";
import { initDrizzle } from "../src/db/initDrizzle";

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

const analyze = process.argv.includes("--analyze");
const unionProbes = process.argv.includes("--union-probes");
const orgId = requireEnv({ key: "EXPLAIN_ORG_ID" });
const planId = requireEnv({ key: "EXPLAIN_PLAN_ID" });
const env = requireEnv({ key: "EXPLAIN_ENV" }) as AppEnv;
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

const explain = async ({ query }: { query: SQL }) =>
	withStatementTimeout({
		run: (tx) =>
			tx.execute(
				analyze
					? sql`EXPLAIN (ANALYZE, BUFFERS, VERBOSE, FORMAT TEXT) ${query}`
					: sql`EXPLAIN (VERBOSE, FORMAT TEXT) ${query}`,
			),
	});

const printPlan = ({
	title,
	rows,
}: {
	title: string;
	rows: Array<Record<string, unknown>>;
}) => {
	console.log(`=== ${title} ===`);
	for (const row of rows) console.log(row["QUERY PLAN"]);
};

const buildUnionProbe = ({
	targets,
	table,
	targetColumn,
}: {
	targets: Array<{ id: string; internal_product_id: string }>;
	table: "customer_entitlements" | "customer_prices";
	targetColumn: "entitlement_id" | "price_id";
}) =>
	buildBoundedVersionableRowRefsQuery({
		targets,
		refTable: table,
		targetColumn,
	});

const main = async () => {
	const products = await withStatementTimeout({
		run: (tx) =>
			tx.execute<{ internal_id: string }>(sql`
				SELECT p.internal_id
				FROM products p
				WHERE p.org_id = ${orgId}
					AND p.env = ${env}
					AND p.id = ${planId}
				ORDER BY p.version
			`),
	});
	const internalProductIds = products.map((product) => product.internal_id);
	if (internalProductIds.length === 0) {
		throw new Error("No staging product versions matched the supplied plan");
	}
	console.log(`product versions: ${internalProductIds.length}`);

	if (unionProbes) {
		const entitlementTargets = await withStatementTimeout({
			run: (tx) =>
				tx.execute<{ id: string; internal_product_id: string }>(sql`
					SELECT id, internal_product_id
					FROM entitlements
					WHERE internal_product_id = ANY(${sql.param(internalProductIds)}::text[])
				`),
		});
		const priceTargets = await withStatementTimeout({
			run: (tx) =>
				tx.execute<{ id: string; internal_product_id: string }>(sql`
					SELECT id, internal_product_id
					FROM prices
					WHERE internal_product_id = ANY(${sql.param(internalProductIds)}::text[])
				`),
		});
		const entitlementPlan = await explain({
			query: buildUnionProbe({
				targets: entitlementTargets,
				table: "customer_entitlements",
				targetColumn: "entitlement_id",
			}),
		});
		const pricePlan = await explain({
			query: buildUnionProbe({
				targets: priceTargets,
				table: "customer_prices",
				targetColumn: "price_id",
			}),
		});
		printPlan({ title: "entitlement refs", rows: entitlementPlan });
		printPlan({ title: "price refs", rows: pricePlan });
		return;
	}

	const entitlementPlan = await explain({
		query: buildVersionableEntitlementRefsQuery({
			internalProductIds,
			orgId,
			env,
		}),
	});
	const pricePlan = await explain({
		query: buildVersionablePriceRefsQuery({
			internalProductIds,
			orgId,
			env,
		}),
	});

	printPlan({ title: "entitlement refs", rows: entitlementPlan });
	printPlan({ title: "price refs", rows: pricePlan });
};

await main().finally(() => client.end());

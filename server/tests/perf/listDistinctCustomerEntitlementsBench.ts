import { ACTIVE_STATUSES } from "@autumn/shared";
import { sql } from "drizzle-orm";
import { initDrizzle } from "@/db/initDrizzle";
import { listDistinctEntitlementsByCustomerLicense } from "@/internal/products/entitlements/repos/listDistinctEntitlementsByCustomerLicense";

const CUSTOMER_ENTITLEMENTS = 100_000;
const DEFINITION_COUNTS = [100, 500] as const;
const WARMUP_RUNS = 3;
const SAMPLE_RUNS = 15;
const CUSTOMER_LICENSE_LINK_ID = "list_distinct_customer_entitlements_bench";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const benchmarkDatabaseUrl = new URL(process.env.DATABASE_URL);
benchmarkDatabaseUrl.hostname = benchmarkDatabaseUrl.hostname.replace(
	"-pooler.",
	".",
);

const { db, client } = initDrizzle({
	databaseUrl: benchmarkDatabaseUrl.toString(),
	maxConnections: 1,
	poolConfig: { options: "-c temp_buffers=512MB" },
});

const percentile = ({
	values,
	quantile,
}: {
	values: number[];
	quantile: number;
}) => {
	const sorted = [...values].sort((left, right) => left - right);
	return sorted[Math.ceil(sorted.length * quantile) - 1];
};

const summarize = (values: number[]) => ({
	mean: values.reduce((sum, value) => sum + value, 0) / values.length,
	p50: percentile({ values, quantile: 0.5 }),
	p95: percentile({ values, quantile: 0.95 }),
	min: Math.min(...values),
	max: Math.max(...values),
});

const createTemporaryTables = async () => {
	for (const table of [
		"features",
		"entitlements",
		"customer_products",
		"customer_entitlements",
	]) {
		await db.execute(
			sql.raw(
				`CREATE TEMP TABLE ${table} (LIKE public.${table} INCLUDING ALL)`,
			),
		);
	}
};

const seedCustomerProducts = async () => {
	await db.execute(sql`
		INSERT INTO customer_products (
			id,
			internal_customer_id,
			internal_product_id,
			status,
			customer_license_link_id,
			created_at
		)
		SELECT
			'bench_customer_product_' || index,
			'bench_customer',
			'bench_product',
			'active',
			${CUSTOMER_LICENSE_LINK_ID},
			index
		FROM generate_series(1, ${sql.raw(String(CUSTOMER_ENTITLEMENTS))}) AS index
	`);
	await db.execute(sql`ANALYZE customer_products`);
};

const seedDefinitions = async ({ count }: { count: number }) => {
	await db.execute(sql`TRUNCATE customer_entitlements, entitlements, features`);
	await db.execute(sql`
		INSERT INTO features (internal_id, org_id, id, name, type, created_at)
		SELECT
			'bench_feature_' || index,
			'bench_org',
			'bench_feature_' || index,
			'Bench feature ' || index,
			'metered',
			index
		FROM generate_series(1, ${sql.raw(String(count))}) AS index
	`);
	await db.execute(sql`
		INSERT INTO entitlements (
			id,
			created_at,
			internal_feature_id,
			allowance_type,
			allowance,
			interval,
			interval_count
		)
		SELECT
			'bench_entitlement_' || index,
			index,
			'bench_feature_' || index,
			'fixed',
			100,
			'month',
			1
		FROM generate_series(1, ${sql.raw(String(count))}) AS index
	`);
	await db.execute(sql`
		INSERT INTO customer_entitlements (
			id,
			customer_product_id,
			entitlement_id,
			internal_customer_id,
			internal_feature_id,
			balance,
			created_at
		)
		SELECT
			'bench_customer_entitlement_' || index,
			'bench_customer_product_' || index,
			'bench_entitlement_' || (((index - 1) % ${count}) + 1),
			'bench_customer',
			'bench_feature_' || (((index - 1) % ${count}) + 1),
			100,
			index
		FROM generate_series(1, ${sql.raw(String(CUSTOMER_ENTITLEMENTS))}) AS index
	`);
	await db.execute(sql`ANALYZE features, entitlements, customer_entitlements`);
};

const explain = async () =>
	db.execute<{ "QUERY PLAN": Record<string, unknown> }>(sql`
		EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
		SELECT DISTINCT entitlement.*, feature.*
		FROM customer_entitlements AS customer_entitlement
		INNER JOIN customer_products AS customer_product
			ON customer_entitlement.customer_product_id = customer_product.id
		INNER JOIN entitlements AS entitlement
			ON customer_entitlement.entitlement_id = entitlement.id
		INNER JOIN features AS feature
			ON entitlement.internal_feature_id = feature.internal_id
		WHERE customer_product.customer_license_link_id = ${CUSTOMER_LICENSE_LINK_ID}
			AND customer_product.status IN (${sql.join(
				[...ACTIVE_STATUSES].map((status) => sql`${status}`),
				sql`, `,
			)})
		ORDER BY entitlement.id
		LIMIT 101
	`);

const listDistinctIdsFirst = async () =>
	db.execute(sql`
		WITH distinct_entitlement_ids AS (
			SELECT DISTINCT customer_entitlement.entitlement_id
			FROM customer_entitlements AS customer_entitlement
			INNER JOIN customer_products AS customer_product
				ON customer_entitlement.customer_product_id = customer_product.id
			WHERE customer_product.customer_license_link_id = ${CUSTOMER_LICENSE_LINK_ID}
				AND customer_product.status IN (${sql.join(
					[...ACTIVE_STATUSES].map((status) => sql`${status}`),
					sql`, `,
				)})
			ORDER BY customer_entitlement.entitlement_id
			LIMIT 101
		)
		SELECT entitlement.*, feature.*
		FROM distinct_entitlement_ids
		INNER JOIN entitlements AS entitlement
			ON distinct_entitlement_ids.entitlement_id = entitlement.id
		INNER JOIN features AS feature
			ON entitlement.internal_feature_id = feature.internal_id
		ORDER BY entitlement.id
	`);

const measure = async ({ query }: { query: () => Promise<unknown[]> }) => {
	for (let run = 0; run < WARMUP_RUNS; run++) await query();

	const durations: number[] = [];
	let returnedDefinitions = 0;
	for (let run = 0; run < SAMPLE_RUNS; run++) {
		const start = performance.now();
		const definitions = await query();
		durations.push(performance.now() - start);
		returnedDefinitions = definitions.length;
	}

	return {
		returnedDefinitions,
		milliseconds: Object.fromEntries(
			Object.entries(summarize(durations)).map(([key, value]) => [
				key,
				Number(value.toFixed(2)),
			]),
		),
	};
};

const benchmark = async ({ definitionCount }: { definitionCount: number }) => {
	await seedDefinitions({ count: definitionCount });

	const currentFunction = await measure({
		query: () =>
			listDistinctEntitlementsByCustomerLicense({
				db,
				customerLicenseLinkId: CUSTOMER_LICENSE_LINK_ID,
				limit: 101,
			}),
	});
	const distinctIdsFirst = await measure({ query: listDistinctIdsFirst });
	const [queryPlan] = await explain();
	console.log(
		JSON.stringify(
			{
				customerEntitlements: CUSTOMER_ENTITLEMENTS,
				definitionCount,
				runs: SAMPLE_RUNS,
				currentFunction,
				distinctIdsFirst,
				queryPlan: queryPlan["QUERY PLAN"],
			},
			null,
			2,
		),
	);
};

const dropBenchmarkIndexes = async () => {
	await db.execute(sql`DROP INDEX IF EXISTS bench_ce_entitlement_product_idx`);
	await db.execute(sql`DROP INDEX IF EXISTS bench_cp_lookup_cover_idx`);
	await db.execute(sql`DROP INDEX IF EXISTS bench_cp_license_status_id_idx`);
};

const benchmarkIndexScenarios = async () => {
	await seedDefinitions({ count: 100 });
	await db.execute(sql`VACUUM ANALYZE customer_products`);
	await db.execute(sql`VACUUM ANALYZE customer_entitlements`);

	const scenarios = [
		{ name: "existing indexes", statements: [] },
		{
			name: "customer entitlement covering",
			statements: [
				"CREATE INDEX bench_ce_entitlement_product_idx ON customer_entitlements (entitlement_id, customer_product_id)",
			],
		},
		{
			name: "customer product lookup covering",
			statements: [
				"CREATE INDEX bench_cp_lookup_cover_idx ON customer_products (id) INCLUDE (customer_license_link_id, status)",
			],
		},
		{
			name: "both covering indexes",
			statements: [
				"CREATE INDEX bench_ce_entitlement_product_idx ON customer_entitlements (entitlement_id, customer_product_id)",
				"CREATE INDEX bench_cp_lookup_cover_idx ON customer_products (id) INCLUDE (customer_license_link_id, status)",
			],
		},
		{
			name: "entitlement covering and reusable license index",
			statements: [
				"CREATE INDEX bench_ce_entitlement_product_idx ON customer_entitlements (entitlement_id, customer_product_id)",
				"CREATE INDEX bench_cp_license_status_id_idx ON customer_products (customer_license_link_id, status, id)",
			],
		},
	];

	const results: Record<string, unknown> = {};
	for (const scenario of scenarios) {
		await dropBenchmarkIndexes();
		for (const statement of scenario.statements) {
			await db.execute(sql.raw(statement));
		}
		await db.execute(sql`VACUUM ANALYZE customer_products`);
		await db.execute(sql`VACUUM ANALYZE customer_entitlements`);
		results[scenario.name] = {
			currentFunction: await measure({
				query: () =>
					listDistinctEntitlementsByCustomerLicense({
						db,
						customerLicenseLinkId: CUSTOMER_LICENSE_LINK_ID,
						limit: 101,
					}),
			}),
			distinctIdsFirst: await measure({ query: listDistinctIdsFirst }),
		};
	}

	console.log(JSON.stringify({ indexScenarios: results }, null, 2));
};

try {
	await createTemporaryTables();
	await seedCustomerProducts();
	for (const definitionCount of DEFINITION_COUNTS) {
		await benchmark({ definitionCount });
	}
	if (process.env.BENCHMARK_INDEXES === "true") {
		await benchmarkIndexScenarios();
	}
} finally {
	await client.end();
}

process.exit(0);

import { AppEnv, RELEVANT_STATUSES } from "@autumn/shared";
import { sql } from "drizzle-orm";
import { initDrizzle, prodTestOrgId } from "./experimentEnv";

// Safe planner-only probe for feature update/delete latency suspects.
// Run from server with: bun run experiments/explainFeatureMutations.ts

type ExplainRow = { "QUERY PLAN": string };

const envArg = process.env.FEATURE_MUTATION_ENV;
const env =
	envArg === AppEnv.Sandbox || envArg === AppEnv.Live
		? envArg
		: AppEnv.Sandbox;
const orgId = process.env.FEATURE_MUTATION_ORG_ID ?? prodTestOrgId;
const featureId = process.env.FEATURE_MUTATION_FEATURE_ID;

const explain = async ({
	db,
	label,
	query,
}: {
	db: ReturnType<typeof initDrizzle>["db"];
	label: string;
	query: ReturnType<typeof sql>;
}) => {
	console.log(`\n--- ${label} ---`);
	const result = await db.execute<ExplainRow>(
		sql`EXPLAIN (FORMAT TEXT) ${query}`,
	);
	for (const row of result) console.log(row["QUERY PLAN"]);
};

const printIndexes = async ({
	db,
	tableNames,
}: {
	db: ReturnType<typeof initDrizzle>["db"];
	tableNames: string[];
}) => {
	const tableList = sql.join(
		tableNames.map((tableName) => sql`${tableName}`),
		sql`, `,
	);
	const rows = await db.execute<{
		indexdef: string;
		indexname: string;
		tablename: string;
	}>(
		sql`
			SELECT tablename, indexname, indexdef
			FROM pg_indexes
			WHERE schemaname = 'public'
				AND tablename IN (${tableList})
			ORDER BY tablename, indexname
		`,
	);

	console.log("\n=== Existing indexes ===");
	for (const row of rows) {
		console.log(`\n[${row.tablename}] ${row.indexname}`);
		console.log(row.indexdef);
	}
};

const printFeatureForeignKeyIndexes = async ({
	db,
}: {
	db: ReturnType<typeof initDrizzle>["db"];
}) => {
	const rows = await db.execute<{
		child_column: string;
		child_indexes_mentioning_column: string;
		child_table: string;
		conname: string;
	}>(
		sql`
			SELECT
				con.conname,
				child.relname AS child_table,
				child_att.attname AS child_column,
				COALESCE(
					string_agg(
						DISTINCT idx.relname || ': ' || pg_get_indexdef(idx.oid),
						E'\n'
						ORDER BY idx.relname || ': ' || pg_get_indexdef(idx.oid)
					),
					'(no matching child index found)'
				) AS child_indexes_mentioning_column
			FROM pg_constraint con
			JOIN pg_class child ON child.oid = con.conrelid
			JOIN pg_namespace child_ns ON child_ns.oid = child.relnamespace
			JOIN pg_class parent ON parent.oid = con.confrelid
			JOIN LATERAL unnest(con.conkey) WITH ORDINALITY AS child_keys(attnum, ord) ON true
			JOIN LATERAL unnest(con.confkey) WITH ORDINALITY AS parent_keys(attnum, ord)
				ON parent_keys.ord = child_keys.ord
			JOIN pg_attribute child_att
				ON child_att.attrelid = child.oid
				AND child_att.attnum = child_keys.attnum
			JOIN pg_attribute parent_att
				ON parent_att.attrelid = parent.oid
				AND parent_att.attnum = parent_keys.attnum
			LEFT JOIN pg_index i ON i.indrelid = child.oid
			LEFT JOIN pg_class idx
				ON idx.oid = i.indexrelid
				AND pg_get_indexdef(idx.oid) ILIKE '%' || child_att.attname || '%'
			WHERE con.contype = 'f'
				AND child_ns.nspname = 'public'
				AND parent.relname = 'features'
				AND parent_att.attname = 'internal_id'
			GROUP BY con.conname, child.relname, child_att.attname
			ORDER BY child.relname, con.conname
		`,
	);

	console.log("\n=== Feature FK child indexes ===");
	for (const row of rows) {
		console.log(`\n${row.conname}`);
		console.log(`${row.child_table}.${row.child_column}`);
		console.log(row.child_indexes_mentioning_column);
	}
};

const printTableEstimates = async ({
	db,
	tableNames,
}: {
	db: ReturnType<typeof initDrizzle>["db"];
	tableNames: string[];
}) => {
	const tableList = sql.join(
		tableNames.map((tableName) => sql`${tableName}`),
		sql`, `,
	);
	const rows = await db.execute<{
		estimated_rows: number;
		size: string;
		table_name: string;
	}>(
		sql`
			SELECT
				c.relname AS table_name,
				c.reltuples::bigint AS estimated_rows,
				pg_size_pretty(pg_total_relation_size(c.oid)) AS size
			FROM pg_class c
			JOIN pg_namespace n ON n.oid = c.relnamespace
			WHERE n.nspname = 'public'
				AND c.relkind = 'r'
				AND c.relname IN (${tableList})
			ORDER BY c.relname
		`,
	);

	console.log("\n=== Table estimates ===");
	for (const row of rows) {
		console.log(`${row.table_name}: ~${row.estimated_rows} rows, ${row.size}`);
	}
};

const pickFeature = async ({ db }: { db: ReturnType<typeof initDrizzle>["db"] }) => {
	if (featureId) {
		const rows = await db.execute<{
			id: string;
			internal_id: string;
		}>(
			sql`
				SELECT id, internal_id
				FROM features
				WHERE org_id = ${orgId}
					AND env = ${env}
					AND id = ${featureId}
				LIMIT 1
			`,
		);
		return rows[0];
	}

	const rows = await db.execute<{
		id: string;
		internal_id: string;
	}>(
		sql`
			SELECT id, internal_id
			FROM features
			WHERE org_id = ${orgId}
				AND env = ${env}
			ORDER BY internal_id DESC
			LIMIT 1
		`,
	);
	return rows[0];
};

const main = async () => {
	const { db, client } = initDrizzle({
		maxConnections: 1,
		poolConfig: {
			application_name: "experiment-feature-mutations-readonly",
			query_timeout: 5_000,
		},
	});

	try {
		await db.execute(sql`SET default_transaction_read_only = on`);
		await db.execute(sql`SET lock_timeout = '250ms'`);
		await db.execute(sql`SET statement_timeout = '5000ms'`);

		console.log("=== Feature mutation query experiment ===");
		console.log(`orgId: ${orgId}`);
		console.log(`env: ${env}`);
		console.log("mode: read-only, planner-only EXPLAIN; no UPDATE/DELETE");

		const tableNames = [
			"features",
			"entitlements",
			"customer_entitlements",
			"entities",
			"usage_windows",
			"products",
			"prices",
			"free_trials",
		];

		await printTableEstimates({ db, tableNames });
		await printIndexes({ db, tableNames });
		await printFeatureForeignKeyIndexes({ db });

		const feature = await pickFeature({ db });
		if (!feature) {
			console.log("\nNo feature found for org/env; nothing to EXPLAIN.");
			return;
		}

		console.log("\n=== Probe feature ===");
		console.log(`feature.id: ${feature.id}`);
		console.log(`feature.internal_id: ${feature.internal_id}`);

		await explain({
			db,
			label: "FeatureService.list: preload org features",
			query: sql`
				SELECT *
				FROM features
				WHERE org_id = ${orgId}
					AND env = ${env}
				ORDER BY internal_id DESC
			`,
		});

		await explain({
			db,
			label: "EntitlementService.getByFeature: delete blocker",
			query: sql`
				SELECT e.*, row_to_json(f) AS feature
				FROM entitlements e
				LEFT JOIN features f ON f.internal_id = e.internal_feature_id
				WHERE e.internal_feature_id COLLATE "C" = ${feature.internal_id}
				LIMIT 1
			`,
		});

		await explain({
			db,
			label: "handleGetFeatureDeletionInfo: products using feature",
			query: sql`
				SELECT
					CASE
						WHEN ROW_NUMBER() OVER (ORDER BY p.created_at) = 1
							THEN p.name
						ELSE NULL
					END AS product_name,
					COUNT(*) OVER () AS total_count
				FROM products p
				INNER JOIN entitlements e
					ON p.internal_id = e.internal_product_id
				WHERE e.internal_feature_id COLLATE "C" = ${feature.internal_id}
					AND p.env = ${env}
					AND p.org_id = ${orgId}
				LIMIT 1
			`,
		});

		await explain({
			db,
			label: "CusEntService.getByFeature: update blocker",
			query: sql`
				SELECT *
				FROM customer_entitlements
				WHERE internal_feature_id COLLATE "C" = ${feature.internal_id}
				LIMIT 10
			`,
		});

		await explain({
			db,
			label: "feature delete FK check: entitlements",
			query: sql`
				SELECT 1
				FROM ONLY entitlements
				WHERE internal_feature_id COLLATE "C" = ${feature.internal_id}
				LIMIT 1
			`,
		});

		await explain({
			db,
			label: "feature delete FK check: customer_entitlements",
			query: sql`
				SELECT 1
				FROM ONLY customer_entitlements
				WHERE internal_feature_id COLLATE "C" = ${feature.internal_id}
				LIMIT 1
			`,
		});

		await explain({
			db,
			label: "feature delete FK check: entities",
			query: sql`
				SELECT 1
				FROM ONLY entities
				WHERE internal_feature_id COLLATE "C" = ${feature.internal_id}
				LIMIT 1
			`,
		});

		await explain({
			db,
			label: "feature delete FK check: usage_windows",
			query: sql`
				SELECT 1
				FROM ONLY usage_windows
				WHERE internal_feature_id COLLATE "C" = ${feature.internal_id}
				LIMIT 1
			`,
		});

		const statusList = sql.join(
			RELEVANT_STATUSES.map((status) => sql`${status}`),
			sql`, `,
		);

		await explain({
			db,
			label: "runClearCreditSystemCacheTask: affected customer count",
			query: sql`
				SELECT COUNT(*)
				FROM customer_entitlements ce
				INNER JOIN customer_products cp
					ON ce.customer_product_id = cp.id
				INNER JOIN customers c
					ON cp.internal_customer_id = c.internal_id
				WHERE ce.internal_feature_id COLLATE "C" = ${feature.internal_id}
					AND cp.status IN (${statusList})
					AND c.org_id = ${orgId}
					AND c.env = ${env}
			`,
		});

		await explain({
			db,
			label: "runClearCreditSystemCacheTask: affected customer page",
			query: sql`
				SELECT DISTINCT c.id AS customer_id, c.internal_id AS internal_customer_id
				FROM customer_entitlements ce
				INNER JOIN customer_products cp
					ON ce.customer_product_id = cp.id
				INNER JOIN customers c
					ON cp.internal_customer_id = c.internal_id
				WHERE ce.internal_feature_id COLLATE "C" = ${feature.internal_id}
					AND cp.status IN (${statusList})
					AND c.org_id = ${orgId}
					AND c.env = ${env}
				ORDER BY c.internal_id
				LIMIT 50000
			`,
		});

		await explain({
			db,
			label: "FeatureService.update/delete target row",
			query: sql`
				SELECT *
				FROM features
				WHERE id = ${feature.id}
					AND org_id = ${orgId}
					AND env = ${env}
				LIMIT 1
			`,
		});

		await explain({
			db,
			label: "ProductService.listFull core products query",
			query: sql`
				SELECT *
				FROM products p
				WHERE p.org_id = ${orgId}
					AND p.env = ${env}
					AND EXISTS (
						SELECT 1
						FROM (
							SELECT id, MAX(version) AS max_version
							FROM products
							WHERE org_id = ${orgId}
								AND env = ${env}
							GROUP BY id
						) latest_versions
						WHERE latest_versions.id = p.id
							AND latest_versions.max_version = p.version
					)
			`,
		});
	} finally {
		await client.end();
	}
};

await main();

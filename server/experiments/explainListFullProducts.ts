import { AppEnv, entitlements, freeTrials, prices, products } from "@autumn/shared";
import { and, eq, exists, sql } from "drizzle-orm";
import { initDrizzle, prodTestOrgId } from "./experimentEnv";

const main = async () => {
	const orgId = prodTestOrgId;
	const env = AppEnv.Live;

	const { db } = initDrizzle();

	// Reproduce the latestVersionsSubquery from ProductService._listFullQuery
	const latestVersionsSubquery = db
		.select({
			id: products.id,
			maxVersion: sql<number>`MAX(${products.version})`.as("max_version"),
		})
		.from(products)
		.where(and(eq(products.org_id, orgId), eq(products.env, env)))
		.groupBy(products.id)
		.as("latest_versions");

	// 1. Run the Drizzle relational query for wall-clock time
	console.log("--- Running ProductService.listFull query ---");
	const start = performance.now();
	const data = await db.query.products.findMany({
		where: and(
			eq(products.org_id, orgId),
			eq(products.env, env),
			exists(
				db
					.select()
					.from(latestVersionsSubquery)
					.where(
						and(
							eq(latestVersionsSubquery.id, products.id),
							eq(latestVersionsSubquery.maxVersion, products.version),
						),
					),
			),
		),
		with: {
			entitlements: {
				with: { feature: true },
				where: eq(entitlements.is_custom, false),
			},
			prices: { where: eq(prices.is_custom, false) },
			free_trials: { where: eq(freeTrials.is_custom, false) },
		},
	});
	const elapsed = performance.now() - start;
	console.log(`Products returned: ${data.length}`);
	console.log(`Wall-clock time: ${elapsed.toFixed(2)}ms\n`);

	// 2. Build equivalent raw SQL so we can wrap with EXPLAIN ANALYZE
	const rawQuery = sql`
		SELECT
			p.internal_id, p.id, p.name, p.description, p.org_id,
			p.created_at, p.env, p.is_add_on, p.is_default, p."group",
			p.version, p.processor, p.base_variant_id, p.archived,
			ent_data.data AS entitlements,
			price_data.data AS prices,
			ft_data.data AS free_trials
		FROM products p
		LEFT JOIN LATERAL (
			SELECT COALESCE(
				json_agg(json_build_object(
					'id', e.id,
					'created_at', e.created_at,
					'internal_feature_id', e.internal_feature_id,
					'internal_product_id', e.internal_product_id,
					'is_custom', e.is_custom,
					'allowance_type', e.allowance_type,
					'allowance', e.allowance,
					'interval', e."interval",
					'interval_count', e.interval_count,
					'carry_from_previous', e.carry_from_previous,
					'entity_feature_id', e.entity_feature_id,
					'org_id', e.org_id,
					'feature_id', e.feature_id,
					'usage_limit', e.usage_limit,
					'rollover', e.rollover,
					'feature', row_to_json(f)
				)),
				'[]'::json
			) AS data
			FROM entitlements e
			LEFT JOIN features f ON f.internal_id = e.internal_feature_id
			WHERE e.internal_product_id = p.internal_id
				AND e.is_custom = false
		) ent_data ON true
		LEFT JOIN LATERAL (
			SELECT COALESCE(
				json_agg(json_build_object(
					'id', pr.id,
					'org_id', pr.org_id,
					'internal_product_id', pr.internal_product_id,
					'config', pr.config,
					'created_at', pr.created_at,
					'billing_type', pr.billing_type,
					'tier_behavior', pr.tier_behavior,
					'is_custom', pr.is_custom,
					'entitlement_id', pr.entitlement_id,
					'proration_config', pr.proration_config
				)),
				'[]'::json
			) AS data
			FROM prices pr
			WHERE pr.internal_product_id = p.internal_id
				AND pr.is_custom = false
		) price_data ON true
		LEFT JOIN LATERAL (
			SELECT COALESCE(
				json_agg(json_build_object(
					'id', ft.id,
					'created_at', ft.created_at,
					'internal_product_id', ft.internal_product_id,
					'duration', ft.duration,
					'length', ft.length,
					'unique_fingerprint', ft.unique_fingerprint,
					'is_custom', ft.is_custom,
					'card_required', ft.card_required
				)),
				'[]'::json
			) AS data
			FROM free_trials ft
			WHERE ft.internal_product_id = p.internal_id
				AND ft.is_custom = false
		) ft_data ON true
		WHERE p.org_id = ${orgId}
			AND p.env = ${env}
			AND EXISTS (
				SELECT id, max_version FROM (
					SELECT id, MAX(version) AS max_version
					FROM products
					WHERE org_id = ${orgId} AND env = ${env}
					GROUP BY id
				) latest_versions
				WHERE latest_versions.id = p.id
					AND max_version = p.version
			)
	`;

	// Run raw query for wall-clock time
	console.log("--- Running raw SQL query ---");
	const start2 = performance.now();
	const rawResult = await db.execute(rawQuery);
	const elapsed2 = performance.now() - start2;
	console.log(`Rows returned: ${rawResult.length}`);
	console.log(`Wall-clock time: ${elapsed2.toFixed(2)}ms\n`);

	// Run EXPLAIN ANALYZE
	console.log("--- EXPLAIN (ANALYZE, BUFFERS) ---\n");
	const explainQuery = sql`EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) ${rawQuery}`;
	const explainResult = await db.execute(explainQuery);

	for (const row of explainResult) {
		const line = (row as Record<string, unknown>)["QUERY PLAN"];
		console.log(line);
	}

	process.exit(0);
};

await main();

/**
 * Compares how many bench pools each license-plan predicate matches, to isolate
 * why the pool repoint stopped matching rows.
 *
 *   infisical run --env=dev --recursive -- bun tests/perf/batch-migrations/probes/probePoolLicensePlanMatch.ts
 */

import { sql } from "drizzle-orm";
import { getBenchContext } from "../utils/benchContext.js";
import { ensureBenchVersionSetCatalog } from "../utils/benchVersionSetCatalog.js";
import { BENCH_VERSET_INTERNAL_CUSTOMER_PREFIX } from "../utils/seedBenchVersionSet.js";

const main = async () => {
	const { ctx, org } = await getBenchContext();
	const { db } = ctx;

	const catalog = await ensureBenchVersionSetCatalog({
		db,
		orgId: org.id,
		env: ctx.env,
		features: ctx.features,
	});
	const [license] = catalog.licenses;
	console.log(
		`probe: licensePlanId=${license.licensePlanId} v1Link=${license.v1PlanLicenseId} seatInternalProductId=${license.licenseInternalProductId}`,
	);

	const prefix = `${BENCH_VERSET_INTERNAL_CUSTOMER_PREFIX}%`;
	const [counts] = await db.execute<Record<string, string>>(sql`
		SELECT
			count(*) AS pools,
			count(pool.plan_license_id) AS with_link,
			count(*) FILTER (WHERE EXISTS (
				SELECT 1 FROM products AS p
				WHERE p.internal_id = pool.license_internal_product_id
					AND p.id = ${license.licensePlanId}
			)) AS matches_via_denormalized_product,
			count(*) FILTER (WHERE EXISTS (
				SELECT 1 FROM plan_license AS link
				INNER JOIN products AS p ON p.internal_id = link.license_internal_product_id
				WHERE link.id = pool.plan_license_id
					AND p.id = ${license.licensePlanId}
			)) AS matches_via_link
		FROM customer_licenses AS pool
		WHERE pool.internal_customer_id LIKE ${prefix}
	`);
	console.log("probe: predicate match counts", counts);

	const links = await db.execute<Record<string, unknown>>(sql`
		SELECT
			link.id,
			link.is_custom,
			link.license_internal_product_id,
			product.id AS product_public_id,
			product.version,
			count(pool.id) AS pools
		FROM plan_license AS link
		LEFT JOIN products AS product
			ON product.internal_id = link.license_internal_product_id
		LEFT JOIN customer_licenses AS pool
			ON pool.plan_license_id = link.id
			AND pool.internal_customer_id LIKE ${prefix}
		WHERE link.id IN (
			SELECT DISTINCT plan_license_id FROM customer_licenses
			WHERE internal_customer_id LIKE ${prefix}
		)
		GROUP BY link.id, link.is_custom, link.license_internal_product_id, product.id, product.version
	`);
	console.log("probe: links the bench pools point at");
	for (const row of links) console.log(" ", row);

	process.exit(0);
};

await main();

import { sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

export type InvariantViolation = {
	name: string;
	count: number;
	sample?: string;
};

/**
 * State that must hold after ANY license migration, whichever lane ran. Each
 * check corresponds to a defect found by hand; encoding them here runs them
 * against every scenario rather than the one they were found in.
 */
export const assertLicenseInvariants = async ({
	db,
	licenseInternalProductId,
}: {
	db: DrizzleCli;
	licenseInternalProductId: string;
}): Promise<InvariantViolation[]> => {
	const violations: InvariantViolation[] = [];

	const check = async ({
		name,
		query,
	}: {
		name: string;
		query: ReturnType<typeof sql>;
	}) => {
		const rows = await db.execute<{ id: string }>(query);
		if (rows.length > 0) {
			violations.push({ name, count: rows.length, sample: rows[0]?.id });
		}
	};

	await check({
		name: "pool references a plan_license that does not exist",
		query: sql`
			SELECT pool.id
			FROM customer_licenses AS pool
			LEFT JOIN plan_license AS link ON link.id = pool.plan_license_id
			WHERE pool.license_internal_product_id = ${licenseInternalProductId}
				AND pool.plan_license_id IS NOT NULL
				AND link.id IS NULL
			LIMIT 5
		`,
	});

	await check({
		name: "license_entitlements references a deleted entitlement",
		query: sql`
			SELECT le.id
			FROM license_entitlements AS le
			JOIN plan_license AS link ON link.id = le.plan_license_id
			LEFT JOIN entitlements AS definition ON definition.id = le.entitlement_id
			WHERE link.license_internal_product_id = ${licenseInternalProductId}
				AND definition.id IS NULL
			LIMIT 5
		`,
	});

	await check({
		name: "assignment holds duplicate rows for one feature",
		query: sql`
			SELECT MIN(target.id) AS id
			FROM customer_entitlements AS target
			JOIN customer_products AS assignment
				ON assignment.id = target.customer_product_id
			JOIN customer_licenses AS pool
				ON pool.link_id = assignment.customer_license_link_id
			WHERE pool.license_internal_product_id = ${licenseInternalProductId}
				AND assignment.internal_entity_id IS NOT NULL
				AND NOT target.is_pooled_balance
			GROUP BY target.customer_product_id, target.internal_feature_id,
				target.entitlement_id
			HAVING COUNT(*) > 1
			LIMIT 5
		`,
	});

	await check({
		name: "pool granted diverges from included plus paid_quantity",
		query: sql`
			SELECT pool.id
			FROM customer_licenses AS pool
			JOIN plan_license AS link ON link.id = pool.plan_license_id
			WHERE pool.license_internal_product_id = ${licenseInternalProductId}
				AND pool.granted IS DISTINCT FROM (link.included + pool.paid_quantity)
			LIMIT 5
		`,
	});

	await check({
		name: "customer_prices orphaned by a removed entitlement",
		query: sql`
			SELECT price.id
			FROM customer_prices AS price
			JOIN prices AS definition ON definition.id = price.price_id
			JOIN customer_products AS assignment
				ON assignment.id = price.customer_product_id
			JOIN customer_licenses AS pool
				ON pool.link_id = assignment.customer_license_link_id
			WHERE pool.license_internal_product_id = ${licenseInternalProductId}
				AND definition.entitlement_id IS NOT NULL
				AND NOT EXISTS (
					SELECT 1 FROM customer_entitlements AS target
					WHERE target.customer_product_id = price.customer_product_id
						AND target.entitlement_id = definition.entitlement_id
				)
			LIMIT 5
		`,
	});

	return violations;
};

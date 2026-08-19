import type { AppEnv } from "@autumn/shared";
import { sql } from "drizzle-orm";
import { z } from "zod/v4";
import type { DrizzleCli } from "@/db/initDrizzle.js";

/** Max exact count returned; anything past this → count_capped ("N+"). */
export const FEATURE_USAGE_COUNT_CAP = 3;
export const FEATURE_USAGE_SAMPLE_LIMIT = 2;
/** Max index rows scanned per reference arm — bounds query cost per feature. */
export const FEATURE_USAGE_SCAN_LIMIT = 200;

const UsageSampleSchema = z.object({
	id: z.string(),
	name: z.string(),
});

export const FeatureUsageSummaryRowSchema = z.object({
	internal_feature_id: z.string(),
	feature_id: z.string(),
	plan_count: z.number().int(),
	plan_capped: z.boolean(),
	plan_samples: z.array(UsageSampleSchema),
	customer_count: z.number().int(),
	customer_capped: z.boolean(),
	customer_samples: z.array(UsageSampleSchema),
});

export type FeatureUsageSummaryRow = z.infer<
	typeof FeatureUsageSummaryRowSchema
>;

/**
 * One round-trip: capped distinct-plan + customer counts and name samples
 * for each candidate feature. Every subquery bounds the rows it SCANS (not
 * just returns), so cost stays flat regardless of org size: each reference
 * arm reads ≤ scanLimit index rows, plans dedupe to ≤ countCap+1 rows,
 * customer samples join ≤ sampleLimit rows off the already-bounded scan.
 * A count is capped when it exceeds countCap or a saturated scan window means
 * the true count is unknowable.
 */
export const buildFeatureUsageSummariesQuery = ({
	features,
	orgId,
	env,
	countCap = FEATURE_USAGE_COUNT_CAP,
	sampleLimit = FEATURE_USAGE_SAMPLE_LIMIT,
	scanLimit = FEATURE_USAGE_SCAN_LIMIT,
}: {
	features: { internalId: string; id: string }[];
	orgId: string;
	env: AppEnv;
	countCap?: number;
	sampleLimit?: number;
	scanLimit?: number;
}) => {
	const internalIds = features.map((feature) => feature.internalId);
	const ids = features.map((feature) => feature.id);

	return sql`
		SELECT
			candidate.internal_feature_id,
			candidate.feature_id,
			coalesce(plans.count, 0)::int AS plan_count,
			coalesce(plans.capped, false) AS plan_capped,
			coalesce(plans.samples, '[]'::json) AS plan_samples,
			coalesce(customers.count, 0)::int AS customer_count,
			coalesce(customers.capped, false) AS customer_capped,
			coalesce(customers.samples, '[]'::json) AS customer_samples
		FROM unnest(
			${sql.param(internalIds)}::text[],
			${sql.param(ids)}::text[]
		) AS candidate(internal_feature_id, feature_id)
		LEFT JOIN LATERAL (
			WITH refs AS (
				(
					SELECT 'entitlement' AS arm, entitlement.internal_product_id
					FROM entitlements entitlement
					WHERE entitlement.internal_feature_id COLLATE "C"
						= candidate.internal_feature_id
					LIMIT ${scanLimit}
				)
				UNION ALL
				(
					SELECT 'entity' AS arm, entitlement.internal_product_id
					FROM entitlements entitlement
					WHERE entitlement.entity_feature_id = candidate.feature_id
					LIMIT ${scanLimit}
				)
				UNION ALL
				(
					SELECT 'price' AS arm, price.internal_product_id
					FROM prices price
					WHERE price.config ->> 'internal_feature_id'
						= candidate.internal_feature_id
					LIMIT ${scanLimit}
				)
			),
			-- Distinct LOGICAL plans (latest version's name), oldest first
			plan_rows AS (
				SELECT plan.id, plan.name, plan.created_at
				FROM (
					SELECT DISTINCT ON (product.id)
						product.id,
						coalesce(product.name, product.id) AS name,
						product.created_at
					FROM (SELECT DISTINCT internal_product_id FROM refs) ref
					JOIN products product
						ON product.internal_id = ref.internal_product_id
					WHERE product.org_id = ${orgId} AND product.env = ${env}
					ORDER BY product.id, product.version DESC
				) plan
				ORDER BY plan.created_at
				LIMIT ${countCap + 1}
			)
			SELECT
				least((SELECT count(*) FROM plan_rows), ${countCap})::int AS count,
				(
					(SELECT count(*) FROM plan_rows) > ${countCap}
					OR EXISTS (
						SELECT 1 FROM refs
						GROUP BY refs.arm
						HAVING count(*) >= ${scanLimit}
					)
				) AS capped,
				(
					SELECT coalesce(
						json_agg(
							json_build_object('id', sample.id, 'name', sample.name)
							ORDER BY sample.created_at
						),
						'[]'::json
					)
					FROM (SELECT * FROM plan_rows LIMIT ${sampleLimit}) sample
				) AS samples
		) plans ON true
		LEFT JOIN LATERAL (
			WITH bounded AS (
				SELECT customer_entitlement.internal_customer_id
				FROM customer_entitlements customer_entitlement
				WHERE customer_entitlement.internal_feature_id COLLATE "C"
					= candidate.internal_feature_id
				LIMIT ${scanLimit}
			)
			SELECT
				least(
					count(DISTINCT bounded.internal_customer_id),
					${countCap}
				)::int AS count,
				(
					count(DISTINCT bounded.internal_customer_id) > ${countCap}
					OR count(*) >= ${scanLimit}
				) AS capped,
				(
					SELECT coalesce(
						json_agg(
							json_build_object('id', sample.id, 'name', sample.name)
							ORDER BY sample.created_at
						),
						'[]'::json
					)
					FROM (
						SELECT
							coalesce(customer.id, customer.internal_id) AS id,
							coalesce(
								nullif(customer.name, ''),
								customer.id,
								customer.internal_id
							) AS name,
							customer.created_at
						FROM (
							SELECT internal_customer_id
							FROM (
								SELECT DISTINCT internal_customer_id FROM bounded
							) distinct_ids
							ORDER BY internal_customer_id
							LIMIT ${sampleLimit}
						) sampled_ids
						JOIN customers customer
							ON customer.internal_id = sampled_ids.internal_customer_id
						WHERE customer.org_id = ${orgId} AND customer.env = ${env}
					) sample
				) AS samples
			FROM bounded
		) customers ON true
	`;
};

export const listFeatureUsageSummaries = async ({
	db,
	features,
	orgId,
	env,
}: {
	db: DrizzleCli;
	features: { internalId: string; id: string }[];
	orgId: string;
	env: AppEnv;
}): Promise<FeatureUsageSummaryRow[]> => {
	if (features.length === 0) return [];

	const rows = await db.execute(
		buildFeatureUsageSummariesQuery({ features, orgId, env }),
	);
	return [...rows].map((row) => {
		const parsed = {
			...row,
			plan_samples:
				typeof row.plan_samples === "string"
					? JSON.parse(row.plan_samples)
					: row.plan_samples,
			customer_samples:
				typeof row.customer_samples === "string"
					? JSON.parse(row.customer_samples)
					: row.customer_samples,
		};
		return FeatureUsageSummaryRowSchema.parse(parsed);
	});
};

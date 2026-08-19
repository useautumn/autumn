import type { AppEnv } from "@autumn/shared";
import { sql } from "drizzle-orm";
import { z } from "zod/v4";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import {
	FEATURE_USAGE_COUNT_CAP,
	FEATURE_USAGE_SAMPLE_LIMIT,
	FEATURE_USAGE_SCAN_LIMIT,
} from "@/internal/features/repos/listFeatureUsageSummaries.js";

const UsageSampleSchema = z.object({
	id: z.string(),
	name: z.string(),
});

export const PlanCustomerUsageRowSchema = z.object({
	usage_key: z.string(),
	customer_count: z.number().int(),
	customer_capped: z.boolean(),
	customer_samples: z.array(UsageSampleSchema),
});

export type PlanCustomerUsageRow = z.infer<typeof PlanCustomerUsageRowSchema>;

export type PlanCustomerUsageCandidate = {
	key: string;
	internalProductIds: string[];
};

/**
 * One round-trip: capped distinct-customer counts and name samples per
 * remove_plans group. The scan arm reads ≤ scanLimit customer_products index
 * rows per key, so cost stays flat regardless of how many customers sit on
 * the plan. A count is capped when it exceeds countCap or the scan window
 * saturated.
 */
export const buildPlanCustomerUsageQuery = ({
	candidates,
	orgId,
	env,
	countCap = FEATURE_USAGE_COUNT_CAP,
	sampleLimit = FEATURE_USAGE_SAMPLE_LIMIT,
	scanLimit = FEATURE_USAGE_SCAN_LIMIT,
}: {
	candidates: PlanCustomerUsageCandidate[];
	orgId: string;
	env: AppEnv;
	countCap?: number;
	sampleLimit?: number;
	scanLimit?: number;
}) => {
	const usageKeys: string[] = [];
	const productIds: string[] = [];
	for (const candidate of candidates) {
		for (const internalProductId of candidate.internalProductIds) {
			usageKeys.push(candidate.key);
			productIds.push(internalProductId);
		}
	}

	return sql`
		WITH ids AS (
			SELECT *
			FROM unnest(
				${sql.param(usageKeys)}::text[],
				${sql.param(productIds)}::text[]
			) AS t(usage_key, internal_product_id)
		),
		keys AS (
			SELECT DISTINCT usage_key FROM ids
		)
		SELECT
			keys.usage_key,
			coalesce(customers.count, 0)::int AS customer_count,
			coalesce(customers.capped, false) AS customer_capped,
			coalesce(customers.samples, '[]'::json) AS customer_samples
		FROM keys
		LEFT JOIN LATERAL (
			WITH bounded AS (
				SELECT customer_product.internal_customer_id
				FROM customer_products customer_product
				WHERE customer_product.internal_product_id IN (
					SELECT ids.internal_product_id
					FROM ids
					WHERE ids.usage_key = keys.usage_key
				)
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

export const listPlanCustomerUsage = async ({
	db,
	candidates,
	orgId,
	env,
}: {
	db: DrizzleCli;
	candidates: PlanCustomerUsageCandidate[];
	orgId: string;
	env: AppEnv;
}): Promise<PlanCustomerUsageRow[]> => {
	const withIds = candidates.filter(
		(candidate) => candidate.internalProductIds.length > 0,
	);
	if (withIds.length === 0) return [];

	const rows = await db.execute(
		buildPlanCustomerUsageQuery({ candidates: withIds, orgId, env }),
	);
	return [...rows].map((row) => {
		const parsed = {
			...row,
			customer_samples:
				typeof row.customer_samples === "string"
					? JSON.parse(row.customer_samples)
					: row.customer_samples,
		};
		return PlanCustomerUsageRowSchema.parse(parsed);
	});
};

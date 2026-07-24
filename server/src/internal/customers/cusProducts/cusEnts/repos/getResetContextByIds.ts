import {
	CustomerSchema,
	FullCusEntWithFullCusProductSchema,
	RELEVANT_STATUSES,
} from "@autumn/shared";
import { sql } from "drizzle-orm";
import { z } from "zod/v4";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { resetCronQueryTag } from "@/internal/balances/batchReset/resetCronQueryTag.js";

/**
 * A customer entitlement hydrated with everything batch reset needs:
 * the FullCusEntWithFullCusProduct shape processReset consumes, plus the
 * owning customer for org/env checks, cache invalidation and redis routing.
 */
export const ResetContextCustomerEntitlementSchema =
	FullCusEntWithFullCusProductSchema.extend({
		customer: CustomerSchema,
		// Reset-scan denormalization flag; not yet part of the shared API model.
		expired: z.boolean().nullable().optional(),
	});

export type ResetContextCustomerEntitlement = z.infer<
	typeof ResetContextCustomerEntitlementSchema
>;

/**
 * Single-statement hydration query for an explicit set of customer entitlement
 * IDs. The full reset-context object is assembled in SQL as jsonb, shaped
 * exactly like ResetContextCustomerEntitlementSchema:
 *   - parent_cp lateral: seat rows (license assignments) inherit
 *     status/subscription_ids from their pool's LIVE parent product; a NULL
 *     link matches nothing, and predecessors lingering on expired parents
 *     lose to live ones via the ORDER BY.
 *   - prices_agg lateral: customer_prices with nested price per product
 *     (price-backed detection + prepaid starting balance).
 *   - rollovers_agg lateral: only evaluated when the entitlement has a
 *     rollover config (needed for post-reset max-cap clearing).
 *
 * Sibling customer_entitlements on the product are intentionally left empty.
 * Exported separately so experiments can EXPLAIN the exact worker query.
 */
export const buildResetContextByIdsQuery = ({
	customerEntitlementIds,
}: {
	customerEntitlementIds: string[];
}) => sql`
	SELECT
		ce.id,
		to_jsonb(ce)
			|| jsonb_build_object(
				'entitlement', to_jsonb(e) || jsonb_build_object('feature', to_jsonb(f)),
				'replaceables', '[]'::jsonb,
				'rollovers', COALESCE(rollovers_agg.rollovers, '[]'::jsonb),
				'customer', to_jsonb(c),
				'customer_product', CASE
					WHEN cp.id IS NULL THEN NULL
					ELSE to_jsonb(cp) || jsonb_build_object(
						'status', COALESCE(parent_cp.parent_status, cp.status),
						'subscription_ids', COALESCE(parent_cp.parent_subscription_ids, cp.subscription_ids),
						'customer_prices', COALESCE(prices_agg.customer_prices, '[]'::jsonb),
						'customer_entitlements', '[]'::jsonb,
						'product', to_jsonb(p)
					)
				END
			) AS reset_context
	FROM customer_entitlements ce
	JOIN entitlements e ON ce.entitlement_id = e.id
	JOIN features f ON e.internal_feature_id = f.internal_id
	JOIN customers c ON ce.internal_customer_id = c.internal_id
	LEFT JOIN customer_products cp ON cp.id = ce.customer_product_id
	LEFT JOIN products p ON cp.internal_product_id = p.internal_id
	LEFT JOIN LATERAL (
		SELECT pcp.status AS parent_status, pcp.subscription_ids AS parent_subscription_ids
		FROM customer_licenses pcl
		JOIN customer_products pcp ON pcp.id = pcl.parent_customer_product_id
		WHERE pcl.link_id = cp.customer_license_link_id
		ORDER BY (pcp.status IN (${sql.join(
			RELEVANT_STATUSES.map((status) => sql`${status}`),
			sql`, `,
		)})) DESC, pcl.created_at DESC
		LIMIT 1
	) parent_cp ON true
	LEFT JOIN LATERAL (
		SELECT jsonb_agg(to_jsonb(cpr) || jsonb_build_object('price', to_jsonb(pr))) AS customer_prices
		FROM customer_prices cpr
		JOIN prices pr ON cpr.price_id = pr.id
		WHERE cpr.customer_product_id COLLATE "C" = cp.id
	) prices_agg ON true
	LEFT JOIN LATERAL (
		SELECT jsonb_agg(to_jsonb(r)) AS rollovers
		FROM rollovers r
		WHERE e.rollover IS NOT NULL AND r.cus_ent_id = ce.id
	) rollovers_agg ON true
	WHERE ce.id = ANY(${sql.param(customerEntitlementIds)}::text[])
	${resetCronQueryTag("hydrateContext")}
`;

/**
 * Hydrates the requested customer entitlement IDs. IDs can legitimately be
 * missing if their rows were deleted between scan and execution. Every
 * returned row is zod-parsed; validation failures are surfaced to the caller.
 */
export const getResetContextByIds = async ({
	db,
	customerEntitlementIds,
}: {
	db: DrizzleCli;
	customerEntitlementIds: string[];
}): Promise<{
	customerEntitlements: ResetContextCustomerEntitlement[];
	invalidIds: { id: string; error: string }[];
	missingIds: string[];
}> => {
	const uniqueIds = [...new Set(customerEntitlementIds)];
	if (uniqueIds.length === 0) {
		return {
			customerEntitlements: [],
			invalidIds: [],
			missingIds: [],
		};
	}

	const rows = await db.execute<{ id: string; reset_context: unknown }>(
		buildResetContextByIdsQuery({ customerEntitlementIds: uniqueIds }),
	);

	const resultCustomerEntitlements: ResetContextCustomerEntitlement[] = [];
	const invalidIds: { id: string; error: string }[] = [];
	const returnedIds = new Set<string>();

	for (const row of rows) {
		returnedIds.add(row.id);
		const parsed = ResetContextCustomerEntitlementSchema.safeParse(
			row.reset_context,
		);
		if (!parsed.success) {
			invalidIds.push({ id: row.id, error: parsed.error.message });
			continue;
		}

		resultCustomerEntitlements.push(parsed.data);
	}

	return {
		customerEntitlements: resultCustomerEntitlements,
		invalidIds,
		missingIds: uniqueIds.filter((id) => !returnedIds.has(id)),
	};
};

import {
	BillingInterval,
	EntInterval,
	type EntitlementWithFeature,
	isBooleanEntitlement,
} from "@autumn/shared";
import { sql } from "drizzle-orm";
import { z } from "zod/v4";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { customerProductsScopeFilter } from "@/internal/migrations/v2/batchOperations/execute/sql/customerProductsScopeFilter.js";
import type { CycleEnrichmentCandidate } from "@/internal/migrations/v2/batchOperations/utils/enrichCustomerEntitlementCycles.js";

const nullableNumeric = z.preprocess(
	(value) => (value === null || value === undefined ? null : Number(value)),
	z.number().nullable(),
);

const CandidateRowSchema = z.object({
	customer_product_id: z.string(),
	internal_customer_id: z.string(),
	customer_id: z.string().nullable(),
	starts_at: nullableNumeric,
	is_paid_recurring: z.boolean(),
	billing_cycle_anchor: nullableNumeric,
	subscription_cycle_anchor: nullableNumeric,
	sibling_reset_cycle_anchor: nullableNumeric,
});

/**
 * Selects the page's add candidates: scope + itemAlreadyExists-parity dedup
 * (same feature — feature-only for booleans, same reset interval otherwise;
 * this also makes replay idempotent). `includeAnchorSources` adds the cycle
 * anchor columns resetting (consumable/credit) adds need for enrichment.
 */
export const buildAddCandidateRowsQuery = ({
	internalCustomerIds,
	fromInternalProductId,
	entitlement,
	includeAnchorSources,
}: {
	internalCustomerIds: string[];
	fromInternalProductId: string;
	entitlement: EntitlementWithFeature;
	includeAnchorSources: boolean;
}) => {
	const targetInterval = String(entitlement.interval ?? EntInterval.Lifetime);
	const targetIntervalCount = entitlement.interval_count ?? 1;

	const dedupIntervalCondition = isBooleanEntitlement({ entitlement })
		? sql``
		: sql`AND COALESCE(existing_definition.interval, ${EntInterval.Lifetime}) = ${targetInterval}`;

	const paidRecurringColumn = includeAnchorSources
		? sql`EXISTS (
				SELECT 1
				FROM customer_prices AS customer_price
				INNER JOIN prices AS price ON price.id = customer_price.price_id
				WHERE customer_price.customer_product_id = cp.id
					AND price.config->>'interval' IS DISTINCT FROM ${BillingInterval.OneOff}
			)`
		: sql`false`;

	const siblingAnchorColumn = includeAnchorSources
		? sql`sibling.reset_cycle_anchor`
		: sql`NULL`;

	const subscriptionAnchorColumn = includeAnchorSources
		? sql`sub_anchor.billing_cycle_anchor_ms`
		: sql`NULL`;

	// subscription_ids hold Stripe ids; anchors are synced in SECONDS, so
	// convert to ms here — every other anchor in the ladder is ms.
	const subscriptionAnchorJoin = includeAnchorSources
		? sql`LEFT JOIN LATERAL (
				SELECT subscription.billing_cycle_anchor_seconds * 1000 AS billing_cycle_anchor_ms
				FROM UNNEST(COALESCE(cp.subscription_ids, ARRAY[]::text[])) AS cp_subscription(stripe_id)
				INNER JOIN subscriptions AS subscription
					ON subscription.stripe_id = cp_subscription.stripe_id
				WHERE subscription.billing_cycle_anchor_seconds IS NOT NULL
				ORDER BY subscription.created_at, subscription.id
				LIMIT 1
			) AS sub_anchor ON true`
		: sql``;

	const siblingJoin = includeAnchorSources
		? sql`LEFT JOIN LATERAL (
				SELECT sibling_entitlement.reset_cycle_anchor
				FROM customer_entitlements AS sibling_entitlement
				INNER JOIN entitlements AS sibling_definition
					ON sibling_definition.id = sibling_entitlement.entitlement_id
				WHERE sibling_entitlement.customer_product_id = cp.id
					AND NOT sibling_entitlement.separate_interval
					AND sibling_entitlement.reset_cycle_anchor IS NOT NULL
					AND sibling_entitlement.next_reset_at IS NOT NULL
					AND COALESCE(sibling_definition.interval, ${EntInterval.Lifetime}) = ${targetInterval}
					AND COALESCE(sibling_definition.interval_count, 1) = ${targetIntervalCount}
				ORDER BY sibling_entitlement.created_at, sibling_entitlement.id
				LIMIT 1
			) AS sibling ON true`
		: sql``;

	return sql`
		SELECT
			cp.id AS customer_product_id,
			cp.internal_customer_id,
			customer.id AS customer_id,
			cp.starts_at,
			${paidRecurringColumn} AS is_paid_recurring,
			cp.billing_cycle_anchor,
			${subscriptionAnchorColumn} AS subscription_cycle_anchor,
			${siblingAnchorColumn} AS sibling_reset_cycle_anchor
		FROM customer_products AS cp
		INNER JOIN customers AS customer
			ON customer.internal_id = cp.internal_customer_id
		${siblingJoin}
		${subscriptionAnchorJoin}
		WHERE ${customerProductsScopeFilter({ internalCustomerIds, fromInternalProductId })}
			AND NOT EXISTS (
				SELECT 1
				FROM customer_entitlements AS existing
				INNER JOIN entitlements AS existing_definition
					ON existing_definition.id = existing.entitlement_id
				WHERE existing.customer_product_id = cp.id
					AND existing.internal_feature_id = ${entitlement.internal_feature_id}
					${dedupIntervalCondition}
			)
		ORDER BY cp.id
	`;
};

export const selectAddCandidateRows = async ({
	db,
	internalCustomerIds,
	fromInternalProductId,
	entitlement,
	includeAnchorSources,
}: {
	db: DrizzleCli;
	internalCustomerIds: string[];
	fromInternalProductId: string;
	entitlement: EntitlementWithFeature;
	includeAnchorSources: boolean;
}): Promise<CycleEnrichmentCandidate[]> => {
	const rows = await db.execute(
		buildAddCandidateRowsQuery({
			internalCustomerIds,
			fromInternalProductId,
			entitlement,
			includeAnchorSources,
		}),
	);

	return rows.map((row) => {
		const parsed = CandidateRowSchema.parse(row);
		return {
			customerProductId: parsed.customer_product_id,
			internalCustomerId: parsed.internal_customer_id,
			customerId: parsed.customer_id,
			startsAt: parsed.starts_at,
			isPaidRecurring: parsed.is_paid_recurring,
			billingCycleAnchor: parsed.billing_cycle_anchor,
			subscriptionCycleAnchor: parsed.subscription_cycle_anchor,
			siblingResetCycleAnchor: parsed.sibling_reset_cycle_anchor,
		};
	});
};

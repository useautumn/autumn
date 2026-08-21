import { BillingInterval, EntInterval } from "@autumn/shared";
import { type SQL, sql } from "drizzle-orm";

/** The four rungs `enrichCustomerEntitlementCycles` reads off a candidate
 * row, plus the joins that produce them. Callers still own FROM / WHERE. */
export type CycleAnchorSourcesSql = {
	paidRecurringColumn: SQL;
	siblingAnchorColumn: SQL;
	subscriptionAnchorColumn: SQL;
	siblingJoin: SQL;
	subscriptionJoin: SQL;
};

/**
 * Sibling cusEnt → cp.billing_cycle_anchor → Stripe sub anchor → paid-now
 * fallback. `keepLiveRowAnchor` is the replace rung: an unchanged cadence
 * keeps the row's own cycle instead of re-anchoring mid-period.
 */
export const cycleAnchorSourcesSql = ({
	include,
	customerProductId,
	subscriptionIds,
	targetInterval,
	targetIntervalCount,
	keepLiveRowAnchor = false,
}: {
	include: boolean;
	customerProductId: SQL;
	subscriptionIds: SQL;
	targetInterval: string;
	targetIntervalCount: number;
	keepLiveRowAnchor?: boolean;
}): CycleAnchorSourcesSql => {
	if (!include) {
		return {
			paidRecurringColumn: sql`false`,
			siblingAnchorColumn: sql`NULL`,
			subscriptionAnchorColumn: sql`NULL`,
			siblingJoin: sql``,
			subscriptionJoin: sql``,
		};
	}

	const excludeLive = keepLiveRowAnchor
		? sql`AND sibling_entitlement.id <> live.id`
		: sql``;

	return {
		paidRecurringColumn: sql`EXISTS (
			SELECT 1
			FROM customer_prices AS customer_price
			INNER JOIN prices AS price ON price.id = customer_price.price_id
			WHERE customer_price.customer_product_id = ${customerProductId}
				AND price.config->>'interval' IS DISTINCT FROM ${BillingInterval.OneOff}
		)`,
		siblingAnchorColumn: keepLiveRowAnchor
			? sql`COALESCE(sibling.reset_cycle_anchor, live.reset_cycle_anchor)`
			: sql`sibling.reset_cycle_anchor`,
		subscriptionAnchorColumn: sql`sub_anchor.billing_cycle_anchor_ms`,
		siblingJoin: sql`LEFT JOIN LATERAL (
			SELECT sibling_entitlement.reset_cycle_anchor
			FROM customer_entitlements AS sibling_entitlement
			INNER JOIN entitlements AS sibling_definition
				ON sibling_definition.id = sibling_entitlement.entitlement_id
			WHERE sibling_entitlement.customer_product_id = ${customerProductId}
				${excludeLive}
				AND NOT sibling_entitlement.separate_interval
				AND sibling_entitlement.reset_cycle_anchor IS NOT NULL
				AND sibling_entitlement.next_reset_at IS NOT NULL
				AND COALESCE(sibling_definition.interval, ${EntInterval.Lifetime}) = ${targetInterval}
				AND COALESCE(sibling_definition.interval_count, 1) = ${targetIntervalCount}
			ORDER BY sibling_entitlement.created_at, sibling_entitlement.id
			LIMIT 1
		) AS sibling ON true`,
		// subscription_ids hold Stripe ids; anchors are synced in SECONDS, so
		// convert to ms here — every other anchor in the ladder is ms.
		subscriptionJoin: sql`LEFT JOIN LATERAL (
			SELECT subscription.billing_cycle_anchor_seconds * 1000 AS billing_cycle_anchor_ms
			FROM UNNEST(COALESCE(${subscriptionIds}, ARRAY[]::text[])) AS cp_subscription(stripe_id)
			INNER JOIN subscriptions AS subscription
				ON subscription.stripe_id = cp_subscription.stripe_id
			WHERE subscription.billing_cycle_anchor_seconds IS NOT NULL
			ORDER BY subscription.created_at, subscription.id
			LIMIT 1
		) AS sub_anchor ON true`,
	};
};

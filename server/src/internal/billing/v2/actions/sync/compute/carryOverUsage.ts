import type { FullCusProduct, FullCustomerEntitlement } from "@autumn/shared";

/**
 * When a sync expires an existing plan and inserts a replacement for the same
 * subject (customer→customer, entity→entity — guaranteed by the entity-scoped
 * transition lookup), carry the expired plan's already-consumed usage onto the
 * new plan's balances so the customer doesn't silently regain a full allowance.
 *
 * Example: Free at 5/10 (5 used) replaced by Pro (20 included) → Pro at 15/20.
 *
 * Mutates `inserted` in place. Matches entitlements by `internal_feature_id`.
 * Conservatively skips entitlements where carry-over is ambiguous or would
 * corrupt structure — unlimited features, features without a numeric
 * allowance (prepaid/pure-usage), and legacy per-entity balance hashes — and
 * leaves those at their fresh allowance.
 */
export const carryOverEntitlementUsage = ({
	inserted,
	expiring,
}: {
	inserted: FullCusProduct;
	expiring: FullCusProduct;
}): void => {
	const expiringByFeature = new Map<string, FullCustomerEntitlement>();
	for (const cusEnt of expiring.customer_entitlements) {
		expiringByFeature.set(cusEnt.internal_feature_id, cusEnt);
	}

	for (const newCusEnt of inserted.customer_entitlements) {
		const oldCusEnt = expiringByFeature.get(newCusEnt.internal_feature_id);
		if (!oldCusEnt) continue;

		// Skip cases where a simple balance transfer doesn't apply.
		if (newCusEnt.unlimited || oldCusEnt.unlimited) continue;
		// Legacy per-entity balance hash — handled differently; leave untouched.
		if (newCusEnt.entities || oldCusEnt.entities) continue;

		const newAllowance = newCusEnt.entitlement.allowance;
		const oldAllowance = oldCusEnt.entitlement.allowance;
		if (newAllowance == null || oldAllowance == null) continue;

		const oldBalance = oldCusEnt.balance ?? 0;
		const consumed = Math.max(0, oldAllowance - oldBalance);
		if (consumed === 0) continue;

		const carriedBalance = newAllowance - consumed;
		// Allow negative (overage) when the feature permits it; otherwise floor
		// at zero so a larger prior consumption can't over-credit.
		newCusEnt.balance = newCusEnt.usage_allowed
			? carriedBalance
			: Math.max(0, carriedBalance);
	}
};

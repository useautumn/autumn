import {
	cusEntsToUsage,
	type FullCusEntWithFullCusProduct,
	type FullCusProduct,
	type FullCustomerEntitlement,
} from "@autumn/shared";

/**
 * When a sync expires an existing plan and inserts a replacement for the same
 * subject (customer→customer, entity→entity — guaranteed by the entity-scoped
 * transition lookup), carry the expired plan's already-consumed usage onto the
 * new plan's balances so the customer doesn't silently regain a full allowance.
 *
 * Example: Free at 5/10 (5 used) replaced by Pro (20 included) → Pro at 15/20.
 *
 * The new entitlement was just initialized to its full granted amount (plain
 * allowance OR prepaid quantity), so the carry is simply
 *   newBalance = newInitialBalance − oldUsage
 * where `oldUsage` is computed via `cusEntsToUsage`, which correctly accounts
 * for prepaid quantity (prepaid features carry their included amount in the
 * prepaid quantity, not in `entitlement.allowance`).
 *
 * Mutates `inserted` in place. Matches entitlements by `internal_feature_id`.
 * Skips unlimited features and legacy per-entity balance hashes (whose balance
 * lives in a per-entity map rather than the top-level `balance`).
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

		if (newCusEnt.unlimited || oldCusEnt.unlimited) continue;
		// Legacy per-entity balance hash — balance lives per-entity, not on the
		// top-level `balance` we mutate here; leave untouched.
		if (newCusEnt.entities || oldCusEnt.entities) continue;

		// Usage consumed on the expiring plan. `cusEntsToUsage` needs the cusEnt
		// linked to its product (for prepaid quantity + plan quantity).
		const oldUsage = cusEntsToUsage({
			cusEnts: [
				{
					...oldCusEnt,
					customer_product: expiring,
				} as FullCusEntWithFullCusProduct,
			],
		});
		if (oldUsage <= 0) continue;

		const carried = (newCusEnt.balance ?? 0) - oldUsage;
		// Allow negative (overage) when the feature permits it; otherwise floor
		// at zero so a larger prior consumption can't over-credit.
		newCusEnt.balance = newCusEnt.usage_allowed
			? carried
			: Math.max(0, carried);
	}
};

import {
	cusEntsToUsage,
	type FullCusEntWithFullCusProduct,
	type FullCusProduct,
	type FullCustomerEntitlement,
	isPayPerUseCustomerEntitlement,
} from "@autumn/shared";

const withProduct = (
	cusEnt: FullCustomerEntitlement,
	product: FullCusProduct,
): FullCusEntWithFullCusProduct =>
	({ ...cusEnt, customer_product: product }) as FullCusEntWithFullCusProduct;

/**
 * A cusEnt whose stored balance is meaningful to carry over. Skips:
 *  - unlimited features (no balance),
 *  - legacy per-entity balance hashes (balance lives per-entity, not top-level),
 *  - pay-per-use / in-arrear components — those are billed from the Stripe meter,
 *    not a stored balance, and a feature can carry BOTH a prepaid/included row
 *    and a pay-per-use overage row under the same feature id (so excluding the
 *    overage also disambiguates the per-feature match).
 */
const isCarriableCusEnt = (
	cusEnt: FullCustomerEntitlement,
	product: FullCusProduct,
): boolean => {
	if (cusEnt.unlimited) return false;
	if (cusEnt.entities) return false;
	if (isPayPerUseCustomerEntitlement(withProduct(cusEnt, product)))
		return false;
	return true;
};

/**
 * When a sync expires an existing plan and inserts a replacement for the same
 * subject (customer→customer, entity→entity — guaranteed by the entity-scoped
 * transition lookup), carry the expired plan's already-consumed usage onto the
 * new plan's balances so the customer doesn't silently regain a full allowance.
 *
 * Example: Free at 5/10 (5 used) replaced by Pro (20 included) → Pro at 15/20.
 *
 * The new entitlement is already initialized to its full granted amount (plain
 * allowance OR prepaid quantity), so the carry is
 *   newBalance = newInitialBalance − oldUsage
 * where `oldUsage` comes from `cusEntsToUsage`, which accounts for prepaid
 * quantity (prepaid keeps its included amount in the prepaid quantity, not in
 * `entitlement.allowance`).
 *
 * Mutates `inserted` in place. Matches the carriable (non-pay-per-use)
 * entitlement of each feature, and only carries when that match is unambiguous.
 */
export const carryOverEntitlementUsage = ({
	inserted,
	expiring,
}: {
	inserted: FullCusProduct;
	expiring: FullCusProduct;
}): void => {
	// Carriable expiring cusEnts grouped by feature (normally one per feature).
	const expiringByFeature = new Map<string, FullCustomerEntitlement[]>();
	for (const cusEnt of expiring.customer_entitlements) {
		if (!isCarriableCusEnt(cusEnt, expiring)) continue;
		const list = expiringByFeature.get(cusEnt.internal_feature_id) ?? [];
		list.push(cusEnt);
		expiringByFeature.set(cusEnt.internal_feature_id, list);
	}

	for (const newCusEnt of inserted.customer_entitlements) {
		if (!isCarriableCusEnt(newCusEnt, inserted)) continue;

		const candidates = expiringByFeature.get(newCusEnt.internal_feature_id);
		// Only carry when there's exactly one carriable counterpart — otherwise
		// the pairing is ambiguous and we leave the fresh balance untouched.
		if (!candidates || candidates.length !== 1) continue;

		const oldUsage = cusEntsToUsage({
			cusEnts: [withProduct(candidates[0], expiring)],
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

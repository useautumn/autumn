import type { FullCustomerEntitlement } from "@autumn/shared";
import { generateId } from "@/utils/genUtils";
import { entitlementToExpiry, initExpiresAt } from "./entitlementExpiry";

/**
 * A purchased balance that expires on its own clock, sharing the plan item's
 * entitlement definition so the product's item set (and `is_custom`) is unchanged.
 * `adjustment` tracks `balance` so granted reports the purchase and usage stays 0.
 */
export const buildExpiringGrantRow = ({
	sourceCustomerEntitlement,
	amount,
	now,
}: {
	sourceCustomerEntitlement: FullCustomerEntitlement;
	amount: number;
	now: number;
}): FullCustomerEntitlement | null => {
	const expiry = entitlementToExpiry({
		entitlement: sourceCustomerEntitlement.entitlement,
	});
	if (!expiry || amount <= 0) return null;

	return {
		...sourceCustomerEntitlement,
		id: generateId("cus_ent"),
		created_at: now,
		balance: amount,
		adjustment: amount,
		additional_balance: 0,
		usage_attribution: {},
		next_reset_at: null,
		reset_cycle_anchor: null,
		cache_version: 0,
		external_id: null,
		expires_at: initExpiresAt({ expiry, now }),
		replaceables: [],
		rollovers: [],
	};
};

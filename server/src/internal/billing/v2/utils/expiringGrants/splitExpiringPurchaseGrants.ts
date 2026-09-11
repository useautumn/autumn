import type { FullCusProduct } from "@autumn/shared";
import { buildExpiringGrantRow } from "./buildExpiringGrantRow";
import { entitlementToExpiry } from "./entitlementExpiry";

/**
 * Moves the purchased portion of an expiring item onto its own grant row,
 * leaving the item's own row as a never-expiring price anchor. Included
 * allowance stays put — only what was bought carries an expiry.
 *
 * MUTATES `customerProduct.customer_entitlements`.
 */
export const splitExpiringPurchaseGrants = ({
	customerProduct,
	now,
}: {
	customerProduct: FullCusProduct;
	now: number;
}) => {
	const grants = [];

	for (const customerEntitlement of customerProduct.customer_entitlements) {
		if (
			!entitlementToExpiry({ entitlement: customerEntitlement.entitlement })
		) {
			continue;
		}

		const allowance = customerEntitlement.entitlement.allowance ?? 0;
		const purchased = (customerEntitlement.balance ?? 0) - allowance;

		const grant = buildExpiringGrantRow({
			sourceCustomerEntitlement: customerEntitlement,
			amount: purchased,
			now,
		});
		if (!grant) continue;

		customerEntitlement.balance = allowance;
		grants.push(grant);
	}

	customerProduct.customer_entitlements.push(...grants);
};

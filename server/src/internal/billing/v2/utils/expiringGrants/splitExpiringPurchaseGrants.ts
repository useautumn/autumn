import type {
	Entitlement,
	FullCusProduct,
	InsertCustomerEntitlement,
} from "@autumn/shared";
import { buildExpiringGrant } from "./buildExpiringGrant";
import { entitlementToExpiry } from "./entitlementExpiry";

/**
 * Moves the purchased portion of an expiring item off the product row and
 * into a loose grant with its own expiry, leaving the item's own row as a
 * never-expiring price anchor. Included allowance stays put — only what was
 * bought carries an expiry.
 *
 * MUTATES the product rows' balances; returns the loose rows to insert.
 */
export const splitExpiringPurchaseGrants = ({
	customerProduct,
	orgId,
	now,
}: {
	customerProduct: FullCusProduct;
	orgId: string;
	now: number;
}): {
	entitlements: Entitlement[];
	customerEntitlements: InsertCustomerEntitlement[];
} => {
	const entitlements: Entitlement[] = [];
	const customerEntitlements: InsertCustomerEntitlement[] = [];

	for (const customerEntitlement of customerProduct.customer_entitlements) {
		if (
			!entitlementToExpiry({ entitlement: customerEntitlement.entitlement })
		) {
			continue;
		}

		const allowance = customerEntitlement.entitlement.allowance ?? 0;
		const purchased = (customerEntitlement.balance ?? 0) - allowance;

		const grant = buildExpiringGrant({
			sourceCustomerEntitlement: {
				...customerEntitlement,
				customer_product: customerProduct,
			},
			amount: purchased,
			source: "attach",
			orgId,
			now,
		});
		if (!grant) continue;

		customerEntitlement.balance = allowance;
		entitlements.push(grant.entitlement);
		customerEntitlements.push(grant.customerEntitlement);
	}

	return { entitlements, customerEntitlements };
};

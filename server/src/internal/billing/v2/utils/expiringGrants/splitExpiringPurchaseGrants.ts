import type {
	Entitlement,
	FullCusProduct,
	InsertCustomerEntitlement,
} from "@autumn/shared";
import { buildExpiringGrant } from "./buildExpiringGrant";
import { entitlementToExpiry } from "./entitlementExpiry";

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

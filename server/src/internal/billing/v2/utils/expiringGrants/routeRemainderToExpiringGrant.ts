import type {
	CustomerEntitlementSource,
	Entitlement,
	FullCusEntWithFullCusProduct,
	InsertCustomerEntitlement,
} from "@autumn/shared";
import type { AutoTopupRebalanceDelta } from "@/internal/balances/autoTopUp/compute/computeRebalancedAutoTopUp";
import { buildExpiringGrant } from "./buildExpiringGrant";
import { entitlementToExpiry } from "./entitlementExpiry";

/**
 * For an expiring item, the remainder of a purchase becomes its own loose
 * grant rather than topping up the shared balance. Paydown deltas against
 * sibling overage are left untouched — healing debt is not a purchase.
 */
export const routeRemainderToExpiringGrant = ({
	deltas,
	customerEntitlement,
	source,
	orgId,
	now,
}: {
	deltas: AutoTopupRebalanceDelta[];
	customerEntitlement: FullCusEntWithFullCusProduct;
	source: CustomerEntitlementSource;
	orgId: string;
	now: number;
}): {
	deltas: AutoTopupRebalanceDelta[];
	customEntitlements: Entitlement[];
	insertCustomerEntitlements: InsertCustomerEntitlement[];
	/** Where the remainder lands: the purchased cusEnt, its expiring grant, or null when paydown took it all. */
	creditedCustomerEntitlementId: string | null;
} => {
	if (!entitlementToExpiry({ entitlement: customerEntitlement.entitlement })) {
		return {
			deltas,
			customEntitlements: [],
			insertCustomerEntitlements: [],
			creditedCustomerEntitlementId: customerEntitlement.id,
		};
	}

	const remainder = deltas
		.filter((delta) => delta.cusEntId === customerEntitlement.id)
		.reduce((total, delta) => total + delta.delta, 0);

	const grant = buildExpiringGrant({
		sourceCustomerEntitlement: customerEntitlement,
		amount: remainder,
		source,
		orgId,
		now,
	});

	return {
		deltas: deltas.filter((delta) => delta.cusEntId !== customerEntitlement.id),
		customEntitlements: grant ? [grant.entitlement] : [],
		insertCustomerEntitlements: grant ? [grant.customerEntitlement] : [],
		creditedCustomerEntitlementId: grant?.customerEntitlement.id ?? null,
	};
};

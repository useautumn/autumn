import type {
	FullCustomerEntitlement,
	InsertCustomerEntitlement,
} from "@autumn/shared";
import type { AutoTopupRebalanceDelta } from "@/internal/balances/autoTopUp/compute/computeRebalancedAutoTopUp";
import { buildExpiringGrantRow } from "./buildExpiringGrantRow";
import { entitlementToExpiry } from "./entitlementExpiry";

/**
 * For an expiring item, the remainder of a purchase becomes its own grant row
 * rather than topping up the shared balance. Paydown deltas against sibling
 * overage are left untouched — healing debt is not a purchase.
 */
export const routeRemainderToExpiringGrant = ({
	deltas,
	customerEntitlement,
	now,
}: {
	deltas: AutoTopupRebalanceDelta[];
	customerEntitlement: FullCustomerEntitlement;
	now: number;
}): {
	deltas: AutoTopupRebalanceDelta[];
	insertCustomerEntitlements: InsertCustomerEntitlement[];
} => {
	if (!entitlementToExpiry({ entitlement: customerEntitlement.entitlement })) {
		return { deltas, insertCustomerEntitlements: [] };
	}

	const remainder = deltas
		.filter((delta) => delta.cusEntId === customerEntitlement.id)
		.reduce((total, delta) => total + delta.delta, 0);

	const grant = buildExpiringGrantRow({
		sourceCustomerEntitlement: customerEntitlement,
		amount: remainder,
		now,
	});

	const {
		entitlement: _entitlement,
		replaceables: _replaceables,
		rollovers: _rollovers,
		...grantRow
	} = grant ?? ({} as NonNullable<typeof grant>);

	return {
		deltas: deltas.filter((delta) => delta.cusEntId !== customerEntitlement.id),
		insertCustomerEntitlements: grant
			? [{ ...grantRow, balance: remainder, adjustment: remainder }]
			: [],
	};
};

import { Decimal } from "decimal.js";
import type { LeanCustomerEntitlement } from "../../models/rows/leanCustomerEntitlement.js";

export const balanceOf = ({
	customerEntitlements,
}: {
	customerEntitlements: LeanCustomerEntitlement[];
}): number =>
	customerEntitlements
		.reduce(
			(total, customerEntitlement) => total.plus(customerEntitlement.balance),
			new Decimal(0),
		)
		.toNumber();

/** Overdrawn rows never lend balance to their siblings, so negatives floor at zero. */
export const availableBalanceOf = ({
	customerEntitlements,
}: {
	customerEntitlements: LeanCustomerEntitlement[];
}): Decimal =>
	customerEntitlements.reduce(
		(total, customerEntitlement) =>
			total.plus(Decimal.max(customerEntitlement.balance, 0)),
		new Decimal(0),
	);

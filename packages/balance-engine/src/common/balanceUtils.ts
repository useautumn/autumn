import { Decimal } from "decimal.js";
import type { LeanCustomerEntitlement } from "./types/customerState/customerStateTypes.js";

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

// Negative balances (overflow debt) do not count towards what a command can
// still consume.
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

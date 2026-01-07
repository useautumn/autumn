import {
	customerPriceToBillingUnits,
	type FullCustomerEntitlement,
	type FullCustomerPrice,
} from "@autumn/shared";
import { Decimal } from "decimal.js";

/**
 * Calculates the entitlement balance change resulting from a quantity update.
 *
 * Computes balance change as: quantity_difference × billing_units_per_quantity.
 * Returns entitlement ID from price association, or undefined if price has no entitlement.
 *
 * @param quantityDifferenceForEntitlements - Change in quantity (can be negative)
 * @param billingUnitsPerQuantity - Multiplier for converting quantities to usage units
 * @param customerPrice - Customer's price configuration
 * @param customerEntitlements - Array of all entitlements for this customer product
 * @returns Entitlement ID and balance change to apply
 */
export const calculateUpdateQuantityEntitlementChange = ({
	quantityDifferenceForEntitlements,
	customerPrice,
	customerEntitlement,
}: {
	quantityDifferenceForEntitlements: number;
	customerPrice: FullCustomerPrice;
	customerEntitlement: FullCustomerEntitlement;
}): {
	customerEntitlementId: string;
	customerEntitlementBalanceChange: number;
} => {
	const billingUnits = customerPriceToBillingUnits({ customerPrice });
	const customerEntitlementBalanceChange = new Decimal(
		quantityDifferenceForEntitlements,
	)
		.mul(billingUnits)
		.toNumber();

	return {
		customerEntitlementId: customerEntitlement?.id,
		customerEntitlementBalanceChange,
	};
};

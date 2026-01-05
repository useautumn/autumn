import {
	type FullCustomerEntitlement,
	type FullCustomerPrice,
	InternalError,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import { getRelatedCusEnt } from "@/internal/customers/cusProducts/cusPrices/cusPriceUtils";

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
export const calculateCustomerEntitlementChange = ({
	quantityDifferenceForEntitlements,
	billingUnitsPerQuantity,
	customerPrice,
	customerEntitlements,
}: {
	quantityDifferenceForEntitlements: number;
	billingUnitsPerQuantity: number;
	customerPrice: FullCustomerPrice;
	customerEntitlements: FullCustomerEntitlement[];
}): {
	customerEntitlementId: string;
	customerEntitlementBalanceChange: number;
} => {
	const customerEntitlement = getRelatedCusEnt({
		cusPrice: customerPrice,
		cusEnts: customerEntitlements,
	});

	if (!customerEntitlement) {
		throw new InternalError({
			message: `[Quantity Update] Related customer entitlement not found for customer price: ${customerPrice.id}`,
		});
	}

	const customerEntitlementBalanceChange = new Decimal(
		quantityDifferenceForEntitlements,
	)
		.mul(billingUnitsPerQuantity)
		.toNumber();

	return {
		customerEntitlementId: customerEntitlement?.id,
		customerEntitlementBalanceChange,
	};
};

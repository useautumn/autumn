import {
	addCusProductToCusEnt,
	cusEntToCusPrice,
	cusEntToInvoiceUsage,
	cusEntToStartingBalance,
	type FullCusProduct,
	type FullCustomerEntitlement,
	isAllocatedPrice,
	isEntityScopedCusEnt,
} from "@autumn/shared";
import { Decimal } from "decimal.js";

/** Seats freed mid-cycle are held until renewal, then drop: the same rule allocatedToStripeItemSpec sets Stripe's quantity with. */
const customerEntitlementToRenewalCustomerEntitlement = ({
	customerProduct,
	customerEntitlement,
}: {
	customerProduct: FullCusProduct;
	customerEntitlement: FullCustomerEntitlement;
}): FullCustomerEntitlement => {
	const cusEnt = addCusProductToCusEnt({
		cusEnt: customerEntitlement,
		cusProduct: customerProduct,
	});
	const customerPrice = cusEntToCusPrice({ cusEnt });
	const isAllocated = customerPrice && isAllocatedPrice(customerPrice.price);
	const freesSeatsAtRenewal = cusEnt.replaceables?.some(
		(replaceable) => replaceable.delete_next_cycle,
	);
	if (!isAllocated || !freesSeatsAtRenewal || isEntityScopedCusEnt(cusEnt)) {
		return customerEntitlement;
	}

	const renewalUsage = cusEntToInvoiceUsage({
		cusEnt,
		subtractReplaceables: true,
	});

	return {
		...customerEntitlement,
		balance: new Decimal(cusEntToStartingBalance({ cusEnt }))
			.sub(renewalUsage)
			.toNumber(),
		replaceables: customerEntitlement.replaceables.filter(
			(replaceable) => !replaceable.delete_next_cycle,
		),
	};
};

/** The customer product as it renews, so next-cycle charges price what Stripe will bill. */
export const customerProductToRenewalCustomerProduct = ({
	customerProduct,
}: {
	customerProduct: FullCusProduct;
}): FullCusProduct => ({
	...customerProduct,
	customer_entitlements: customerProduct.customer_entitlements.map(
		(customerEntitlement) =>
			customerEntitlementToRenewalCustomerEntitlement({
				customerProduct,
				customerEntitlement,
			}),
	),
});

import {
	addCusProductToCusEnt,
	type BillingContext,
	cusProductToProduct,
	type FullCusProduct,
	featureUtils,
	isOneOffPrepaidConsumableCustomerEntitlement,
	isResettingEntitlement,
	type UpdateCustomerEntitlement,
} from "@autumn/shared";
import { initCustomerEntitlementBalance } from "@/internal/billing/v2/utils/initFullCustomerProduct/initCustomerEntitlement/initCustomerEntitlementBalance";

/** Refills every cycle-resetting balance to its full grant, as a new billing period starts. */
export const computeCycleBalanceResets = ({
	billingContext,
	customerProduct,
}: {
	billingContext: BillingContext;
	customerProduct: FullCusProduct;
}): UpdateCustomerEntitlement[] =>
	customerProduct.customer_entitlements.flatMap((customerEntitlement) => {
		const { entitlement } = customerEntitlement;
		const refillsOnNewCycle =
			isResettingEntitlement({ entitlement }) &&
			!featureUtils.isAllocated(entitlement.feature) &&
			!isOneOffPrepaidConsumableCustomerEntitlement(
				addCusProductToCusEnt({
					cusEnt: customerEntitlement,
					cusProduct: customerProduct,
				}),
			);
		if (!refillsOnNewCycle) return [];

		const { balance, entities } = initCustomerEntitlementBalance({
			initContext: {
				fullCustomer: billingContext.fullCustomer,
				fullProduct: cusProductToProduct({ cusProduct: customerProduct }),
				featureQuantities: customerProduct.options,
			},
			entitlement,
		});
		return [
			{
				customerEntitlement,
				updates: { balance, adjustment: 0, entities: entities ?? undefined },
			},
		];
	});

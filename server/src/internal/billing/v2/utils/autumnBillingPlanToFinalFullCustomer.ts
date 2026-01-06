import type { BillingContext } from "@/internal/billing/v2/billingContext";
import type { AutumnBillingPlan } from "@/internal/billing/v2/types/billingPlan";

export const autumnBillingPlanToFinalFullCustomer = ({
	billingContext,
	autumnBillingPlan,
}: {
	billingContext: BillingContext;
	autumnBillingPlan: AutumnBillingPlan;
}) => {
	const finalFullCustomer = structuredClone(billingContext.fullCustomer);

	// 1. Update full customer with new customer products
	finalFullCustomer.customer_products = [
		...finalFullCustomer.customer_products,
		...autumnBillingPlan.insertCustomerProducts,
	];

	// 2. Update customer product
	for (let i = 0; i < finalFullCustomer.customer_products.length; i++) {
		const customerProduct = finalFullCustomer.customer_products[i];
		if (customerProduct.id === autumnBillingPlan.updateCustomerProduct?.id) {
			finalFullCustomer.customer_products[i] =
				autumnBillingPlan.updateCustomerProduct;
		}
	}

	// 3. Update full customer with updated customer entitlements
	if (autumnBillingPlan.updateCustomerEntitlements) {
		for (const update of autumnBillingPlan.updateCustomerEntitlements) {
			for (const customerProduct of finalFullCustomer.customer_products) {
				for (const customerEntitlement of customerProduct.customer_entitlements) {
					if (customerEntitlement.id === update.customerEntitlementId) {
						customerEntitlement.balance =
							(customerEntitlement.balance ?? 0) + update.balanceChange;
					}
				}
			}
		}
	}

	return finalFullCustomer;
};

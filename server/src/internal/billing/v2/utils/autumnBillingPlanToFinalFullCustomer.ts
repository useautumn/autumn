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
	const {
		updateCustomerProduct,
		insertCustomerProducts,
		updateCustomerEntitlements,
	} = autumnBillingPlan;

	// 1. Update full customer with new customer products
	finalFullCustomer.customer_products = [
		...finalFullCustomer.customer_products,
		...insertCustomerProducts,
	];

	// 2. Update customer product
	for (let i = 0; i < finalFullCustomer.customer_products.length; i++) {
		const customerProduct = finalFullCustomer.customer_products[i];
		if (customerProduct.id === updateCustomerProduct?.id) {
			finalFullCustomer.customer_products[i] = updateCustomerProduct;
		}
	}

	// 3. Update full customer with updated customer entitlements
	if (updateCustomerEntitlements) {
		const allEntitlements = finalFullCustomer.customer_products.flatMap(
			(customerProduct) => customerProduct.customer_entitlements,
		);

		for (const update of updateCustomerEntitlements) {
			for (const entitlement of allEntitlements) {
				if (entitlement.id === update.customerEntitlementId) {
					entitlement.balance =
						(entitlement.balance ?? 0) + update.balanceChange;
				}
			}
		}
	}

	return finalFullCustomer;
};

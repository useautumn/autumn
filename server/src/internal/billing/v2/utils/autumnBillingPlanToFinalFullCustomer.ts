import type { BillingContext } from "@/internal/billing/v2/billingContext";
import type { AutumnBillingPlan } from "@/internal/billing/v2/types/billingPlan";

export const autumnBillingPlanToFinalFullCustomer = ({
	billingContext,
	autumnBillingPlan,
}: {
	billingContext: BillingContext;
	autumnBillingPlan: AutumnBillingPlan;
}) => {
	const {
		updateCustomerProduct,
		insertCustomerProducts,
		updateCustomerEntitlements,
	} = autumnBillingPlan;

	const finalFullCustomer = structuredClone(billingContext.fullCustomer);

	// 1. Combine existing customer products with new ones
	const combinedCustomerProducts = [
		...finalFullCustomer.customer_products,
		...insertCustomerProducts,
	];

	// 2. Replace updated customer product if applicable
	const customerProducts = combinedCustomerProducts.map((customerProduct) =>
		customerProduct.id === updateCustomerProduct?.id
			? updateCustomerProduct
			: customerProduct,
	);

	// 3. Apply entitlement balance updates
	if (updateCustomerEntitlements) {
		const entitlementById = new Map(
			customerProducts
				.flatMap((customerProduct) => customerProduct.customer_entitlements)
				.map((entitlement) => [entitlement.id, entitlement]),
		);

		for (const update of updateCustomerEntitlements) {
			const entitlement = entitlementById.get(update.customerEntitlementId);
			if (entitlement) {
				entitlement.balance = (entitlement.balance ?? 0) + update.balanceChange;
			}
		}
	}

	// 4. Return final full customer
	return {
		...finalFullCustomer,
		customer_products: customerProducts,
	};
};

import type { BillingContext } from "@autumn/shared";
import type { AutumnBillingPlan } from "@autumn/shared";
import { billingPlanToUpdatedCustomerProduct } from "@/internal/billing/v2/utils/billingPlan/billingPlanToUpdatedCustomerProduct";

export const autumnBillingPlanToFinalFullCustomer = ({
	billingContext,
	autumnBillingPlan,
}: {
	billingContext: BillingContext;
	autumnBillingPlan: AutumnBillingPlan;
}) => {
	const {
		deleteCustomerProduct,
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
	const updatedCustomerProduct = billingPlanToUpdatedCustomerProduct({
		autumnBillingPlan,
	});

	let customerProducts = combinedCustomerProducts.map((customerProduct) =>
		customerProduct.id === updatedCustomerProduct?.id
			? updatedCustomerProduct
			: customerProduct,
	);

	// 3. Remove deleted customer product if applicable
	if (deleteCustomerProduct) {
		customerProducts = customerProducts.filter(
			(customerProduct) => customerProduct.id !== deleteCustomerProduct.id,
		);
	}

	// 4. Apply entitlement balance updates
	if (updateCustomerEntitlements) {
		const entitlementById = new Map(
			customerProducts
				.flatMap((customerProduct) => customerProduct.customer_entitlements)
				.map((entitlement) => [entitlement.id, entitlement]),
		);

		for (const update of updateCustomerEntitlements) {
			const entitlement = entitlementById.get(update.customerEntitlement.id);
			if (entitlement) {
				entitlement.balance =
					(entitlement.balance ?? 0) + (update.balanceChange ?? 0);
			}
		}
	}

	// 5. Return final full customer
	return {
		...finalFullCustomer,
		customer_products: customerProducts,
	};
};

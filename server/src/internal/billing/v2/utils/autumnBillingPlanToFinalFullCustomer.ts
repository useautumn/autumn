import type { AutumnBillingPlan, BillingContext } from "@autumn/shared";
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
			if (!entitlement) continue;

			entitlement.balance =
				(entitlement.balance ?? 0) + (update.balanceChange ?? 0);

			if (update.insertReplaceables && update.insertReplaceables.length > 0) {
				entitlement.replaceables = [
					...(entitlement.replaceables ?? []),
					...update.insertReplaceables.map((r) => ({
						...r,
						delete_next_cycle: r.delete_next_cycle ?? false,
					})),
				];
			}

			if (update.deletedReplaceables && update.deletedReplaceables.length > 0) {
				entitlement.replaceables = entitlement.replaceables?.filter(
					(r) => !update.deletedReplaceables?.map((dr) => dr.id).includes(r.id),
				);
			}
		}
	}

	// 5. Return final full customer
	return {
		...finalFullCustomer,
		customer_products: customerProducts,
	};
};

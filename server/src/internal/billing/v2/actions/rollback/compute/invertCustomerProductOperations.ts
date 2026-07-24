import type { AutumnBillingPlan, CustomerProductUpdate } from "@autumn/shared";
import {
	applyCustomerProductPatch,
	applyCustomerProductUpdate,
} from "@/internal/billing/v2/utils/billingPlan/customerProductPlanMutations";
import { getPreviousValues } from "@/internal/billing/v2/utils/billingPlan/getPreviousValues";

export const invertCustomerProductUpdate = ({
	customerProduct,
	updates,
}: CustomerProductUpdate): CustomerProductUpdate => ({
	customerProduct: applyCustomerProductUpdate({ customerProduct, updates }),
	updates: getPreviousValues({ before: customerProduct, updates }),
});

export const invertCustomerProductPatch = (
	patch: NonNullable<AutumnBillingPlan["patchCustomerProducts"]>[number],
) => ({
	customerProduct: applyCustomerProductPatch({
		customerProduct: patch.customerProduct,
		patch,
	}),
	insertCustomerEntitlements: patch.deleteCustomerEntitlements,
	insertCustomerPrices: patch.deleteCustomerPrices,
	deleteCustomerEntitlements: patch.insertCustomerEntitlements,
	deleteCustomerPrices: patch.insertCustomerPrices,
});

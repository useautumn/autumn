import type {
	AutumnBillingPlan,
	BillingContext,
	FullCusProduct,
} from "@autumn/shared";
import { CusProductStatus } from "@autumn/shared";

/**
 * Builds the Stripe-facing product timeline when Autumn access starts before billing.
 */
export const buildCustomerProductsForStripe = ({
	billingContext,
	autumnBillingPlan,
	finalCustomerProducts,
}: {
	billingContext: BillingContext;
	autumnBillingPlan: AutumnBillingPlan;
	finalCustomerProducts: FullCusProduct[];
}): FullCusProduct[] => {
	const { billingStartsAt } = billingContext;
	if (billingStartsAt === undefined) return finalCustomerProducts;

	const insertedCustomerProductIds = new Set(
		autumnBillingPlan.insertCustomerProducts.map(
			(customerProduct) => customerProduct.id,
		),
	);
	const outgoingCustomerProduct =
		autumnBillingPlan.updateCustomerProduct?.customerProduct;

	return finalCustomerProducts.map((customerProduct) => {
		if (insertedCustomerProductIds.has(customerProduct.id)) {
			return {
				...customerProduct,
				status: CusProductStatus.Scheduled,
				starts_at: billingStartsAt,
			};
		}

		if (outgoingCustomerProduct?.id === customerProduct.id) {
			return {
				...outgoingCustomerProduct,
				status: CusProductStatus.Active,
				ended_at: billingStartsAt,
				canceled: true,
				canceled_at: billingContext.currentEpochMs,
			};
		}

		return customerProduct;
	});
};

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
	if (billingContext.accessStartsAt === undefined) return finalCustomerProducts;

	const insertedCustomerProductIds = new Set(
		autumnBillingPlan.insertCustomerProducts.map(
			(customerProduct) => customerProduct.id,
		),
	);
	const billingStartMs = autumnBillingPlan.insertCustomerProducts.find(
		(customerProduct) =>
			customerProduct.access_starts_at !== undefined &&
			customerProduct.access_starts_at !== null,
	)?.starts_at;

	if (billingStartMs === undefined) return finalCustomerProducts;

	const outgoingCustomerProduct =
		autumnBillingPlan.updateCustomerProduct?.customerProduct;

	return finalCustomerProducts.map((customerProduct) => {
		if (insertedCustomerProductIds.has(customerProduct.id)) {
			return {
				...customerProduct,
				status: CusProductStatus.Scheduled,
				starts_at: billingStartMs,
			};
		}

		if (outgoingCustomerProduct?.id === customerProduct.id) {
			return {
				...outgoingCustomerProduct,
				status: CusProductStatus.Active,
				ended_at: billingStartMs,
				canceled: true,
				canceled_at: billingContext.currentEpochMs,
			};
		}

		return customerProduct;
	});
};

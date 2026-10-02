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

	const earlyAccessCustomerProducts =
		autumnBillingPlan.insertCustomerProducts.filter(
			(customerProduct) => customerProduct.access_starts_at != null,
		);
	const earlyAccessCustomerProductIds = new Set(
		earlyAccessCustomerProducts.map((customerProduct) => customerProduct.id),
	);
	const billingStartMs = earlyAccessCustomerProducts[0]?.starts_at;

	if (billingStartMs === undefined) return finalCustomerProducts;

	const outgoingCustomerProduct =
		autumnBillingPlan.updateCustomerProduct?.customerProduct;

	return finalCustomerProducts.map((customerProduct) => {
		if (earlyAccessCustomerProductIds.has(customerProduct.id)) {
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

import {
	type AutumnBillingPlan,
	isFreeProduct,
	type MultiAttachBillingContext,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { computeImmediateMultiProductPlan } from "../../common/immediateMultiProduct/computeImmediateMultiProductPlan";

/**
 * Computes the billing plan for attaching multiple products.
 *
 * For each product, creates a temporary AttachBillingContext and reuses
 * computeAttachNewCustomerProduct to build the new customer product.
 * At most one product may trigger a transition (validated by error handler).
 */
export const computeMultiAttachPlan = ({
	ctx,
	multiAttachBillingContext,
}: {
	ctx: AutumnContext;
	multiAttachBillingContext: MultiAttachBillingContext;
}): AutumnBillingPlan => {
	const plan = computeImmediateMultiProductPlan({
		ctx,
		billingContext: multiAttachBillingContext,
	});

	// Lock the customer's currency on the first paid multi-attach (only when they
	// have none yet). Free attaches don't commit a currency. Applied conditionally at execute.
	const {
		fullCustomer,
		fullProducts,
		currency: resolvedCurrency,
	} = multiAttachBillingContext;
	const allPrices = fullProducts.flatMap((fullProduct) => fullProduct.prices);
	const lockCustomerCurrency =
		resolvedCurrency &&
		!fullCustomer.currency &&
		!isFreeProduct({ prices: allPrices })
			? {
					internalCustomerId: fullCustomer.internal_id,
					currency: resolvedCurrency,
				}
			: undefined;

	return { ...plan, lockCustomerCurrency };
};

import {
	type AutumnBillingPlan,
	isFreeProduct,
	type MultiAttachBillingContext,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { applyBillingCycleAnchorToSharedSubscription } from "@/internal/billing/v2/compute/computeAutumnUtils/applyBillingCycleAnchorToSharedSubscription";
import { computeImmediateMultiProductPlan } from "../../common/immediateMultiProduct/computeImmediateMultiProductPlan";

/** Computes the atomic Autumn plan for every requested product. */
export const computeMultiAttachPlan = ({
	ctx,
	multiAttachBillingContext,
}: {
	ctx: AutumnContext;
	multiAttachBillingContext: MultiAttachBillingContext;
}): AutumnBillingPlan => {
	const plan = applyBillingCycleAnchorToSharedSubscription({
		plan: computeImmediateMultiProductPlan({
			ctx,
			billingContext: multiAttachBillingContext,
		}),
		billingContext: multiAttachBillingContext,
		stripeSubscriptionId:
			multiAttachBillingContext.stripeSubscription?.id ??
			multiAttachBillingContext.productContexts.find(
				(productContext) =>
					productContext.currentCustomerProduct?.subscription_ids?.[0],
			)?.currentCustomerProduct?.subscription_ids?.[0],
	});

	// Lock the customer's currency on the first paid multi-attach (only when they
	// have none yet). Free attaches don't commit a currency. Applied conditionally at execute.
	const {
		fullCustomer,
		fullProducts,
		currency: resolvedCurrency,
	} = multiAttachBillingContext;
	const allProductsFree = fullProducts.every((product) =>
		isFreeProduct({ product }),
	);
	const lockCustomerCurrency =
		resolvedCurrency && !fullCustomer.currency && !allProductsFree
			? {
					internalCustomerId: fullCustomer.internal_id,
					currency: resolvedCurrency,
				}
			: undefined;

	return { ...plan, lockCustomerCurrency };
};

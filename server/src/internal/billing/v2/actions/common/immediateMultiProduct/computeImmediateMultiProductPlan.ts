import type {
	AttachBillingContext,
	AutumnBillingPlan,
	MultiAttachBillingContext,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { computeAttachNewCustomerProduct } from "@/internal/billing/v2/actions/attach/compute/computeAttachNewCustomerProduct";
import { computeAttachTransitionUpdates } from "@/internal/billing/v2/actions/attach/compute/computeAttachTransitionUpdates";
import { buildAutumnLineItems } from "@/internal/billing/v2/compute/computeAutumnUtils/buildAutumnLineItems";
import { finalizeLineItems } from "@/internal/billing/v2/compute/finalize/finalizeLineItems";
import { productContextToAttachBillingContext } from "@/internal/billing/v2/utils/billingContext/productContextToAttachBillingContext";

/** Compute the billing plan for immediate multi-product billing. */
export const computeImmediateMultiProductPlan = ({
	ctx,
	billingContext,
}: {
	ctx: AutumnContext;
	billingContext: MultiAttachBillingContext;
}): AutumnBillingPlan => {
	const transitioningProductContext = billingContext.productContexts.find(
		(productContext) => productContext.currentCustomerProduct !== undefined,
	);
	const deletedCustomerProduct =
		transitioningProductContext?.currentCustomerProduct;
	const scheduledCustomerProduct =
		transitioningProductContext?.scheduledCustomerProduct;

	let transitionContext: AttachBillingContext | undefined;
	const insertCustomerProducts = billingContext.productContexts.map(
		(productContext) => {
			const attachBillingContext = productContextToAttachBillingContext({
				billingContext,
				productContext,
			});

			if (productContext.currentCustomerProduct) {
				transitionContext = attachBillingContext;
			}

			return computeAttachNewCustomerProduct({
				ctx,
				attachBillingContext,
			});
		},
	);

	const updateCustomerProduct = transitionContext
		? computeAttachTransitionUpdates({
				attachBillingContext: transitionContext,
			})
		: undefined;

	const { allLineItems, updateCustomerEntitlements } = buildAutumnLineItems({
		ctx,
		newCustomerProducts: insertCustomerProducts,
		deletedCustomerProduct,
		billingContext,
		includeArrearLineItems: deletedCustomerProduct !== undefined,
	});

	const billingPlan: AutumnBillingPlan = {
		customerId:
			billingContext.fullCustomer.id ?? billingContext.fullCustomer.internal_id,
		insertCustomerProducts,
		updateCustomerProduct,
		deleteCustomerProduct: scheduledCustomerProduct,
		customPrices: billingContext.customPrices,
		customEntitlements: billingContext.customEnts,
		customFreeTrial: billingContext.trialContext?.customFreeTrial,
		lineItems: allLineItems,
		updateCustomerEntitlements,
	};

	billingPlan.lineItems = finalizeLineItems({
		ctx,
		lineItems: billingPlan.lineItems ?? [],
		billingContext,
		autumnBillingPlan: billingPlan,
	});

	return billingPlan;
};

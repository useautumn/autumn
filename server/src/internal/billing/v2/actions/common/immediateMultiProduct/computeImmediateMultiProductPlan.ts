import type {
	AutumnBillingPlan,
	FullCusProduct,
	MultiAttachBillingContext,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { computeAttachNewCustomerProduct } from "@/internal/billing/v2/actions/attach/compute/computeAttachNewCustomerProduct";
import { computeAttachTransitionUpdates } from "@/internal/billing/v2/actions/attach/compute/computeAttachTransitionUpdates";
import { buildAutumnLineItems } from "@/internal/billing/v2/compute/computeAutumnUtils/buildAutumnLineItems";
import { finalizeLineItems } from "@/internal/billing/v2/compute/finalize/finalizeLineItems";
import { computePooledBalanceTransitionPlan } from "@/internal/billing/v2/pooledBalances/compute/computePooledBalanceTransitionPlan";
import { productContextToAttachBillingContext } from "@/internal/billing/v2/utils/billingContext/productContextToAttachBillingContext";
import { cusProductsToOneOffPrepaidCarryOvers } from "@/internal/billing/v2/utils/handleOneOffPrepaidCarryOvers/cusProductToOneOffPrepaidCarryOvers";

/** Compute the billing plan for immediate multi-product billing. */
export const computeImmediateMultiProductPlan = ({
	ctx,
	billingContext,
}: {
	ctx: AutumnContext;
	billingContext: MultiAttachBillingContext;
}): AutumnBillingPlan => {
	const productChanges = billingContext.productContexts.map(
		(productContext) => {
			const attachBillingContext = productContextToAttachBillingContext({
				billingContext,
				productContext,
			});

			return {
				attachBillingContext,
				incomingCustomerProduct: computeAttachNewCustomerProduct({
					ctx,
					attachBillingContext,
				}),
				outgoingCustomerProduct: productContext.currentCustomerProduct,
				scheduledCustomerProduct: productContext.scheduledCustomerProduct,
			};
		},
	);
	const insertCustomerProducts = productChanges.map(
		({ incomingCustomerProduct }) => incomingCustomerProduct,
	);
	const outgoingCustomerProducts: FullCusProduct[] = [];
	const updateCustomerProducts: NonNullable<
		AutumnBillingPlan["updateCustomerProducts"]
	> = [];
	const scheduledCustomerProducts = new Map<string, FullCusProduct>();

	for (const productChange of productChanges) {
		if (productChange.outgoingCustomerProduct) {
			outgoingCustomerProducts.push(productChange.outgoingCustomerProduct);
			const updateCustomerProduct = computeAttachTransitionUpdates({
				attachBillingContext: productChange.attachBillingContext,
			});
			if (updateCustomerProduct) {
				updateCustomerProducts.push(updateCustomerProduct);
			}
		}

		if (productChange.scheduledCustomerProduct) {
			scheduledCustomerProducts.set(
				productChange.scheduledCustomerProduct.id,
				productChange.scheduledCustomerProduct,
			);
		}
	}

	const { pooledBalancePlan } = computePooledBalanceTransitionPlan({
		ctx,
		fullCustomer: billingContext.fullCustomer,
		outgoingCustomerProducts,
		incomingCustomerProducts: insertCustomerProducts,
		stripeSubscriptionId: billingContext.stripeSubscription?.id,
		now: billingContext.currentEpochMs,
	});

	const { allLineItems, updateCustomerEntitlements } = buildAutumnLineItems({
		ctx,
		newCustomerProducts: insertCustomerProducts,
		deletedCustomerProducts: outgoingCustomerProducts,
		billingContext,
		includeArrearLineItems: outgoingCustomerProducts.length > 0,
	});

	const oneOffPrepaidCarryOvers = cusProductsToOneOffPrepaidCarryOvers({
		currentCustomerProducts: outgoingCustomerProducts,
		fullCustomer: billingContext.fullCustomer,
	});
	const billingPlan: AutumnBillingPlan = {
		customerId:
			billingContext.fullCustomer.id ?? billingContext.fullCustomer.internal_id,
		insertCustomerProducts,
		updateCustomerProducts,
		deleteCustomerProducts: [...scheduledCustomerProducts.values()],
		customPrices: billingContext.customPrices,
		customEntitlements: [
			...(billingContext.customEnts ?? []),
			...oneOffPrepaidCarryOvers.entitlements,
		],
		customFreeTrial: billingContext.trialContext?.customFreeTrial,
		lineItems: allLineItems,
		updateCustomerEntitlements,
		insertCustomerEntitlements: oneOffPrepaidCarryOvers.customerEntitlements,
		pooledBalancePlan,
	};

	billingPlan.lineItems = finalizeLineItems({
		ctx,
		lineItems: billingPlan.lineItems ?? [],
		billingContext,
		autumnBillingPlan: billingPlan,
	});

	return billingPlan;
};

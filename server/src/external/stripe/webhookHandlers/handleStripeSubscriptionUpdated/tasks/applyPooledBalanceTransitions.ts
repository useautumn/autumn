import { refreshAllocationScaleAfterWrite } from "@/internal/balances/allocate/actions/refreshAllocationScale";
import { ALLOCATIONS_ADJUSTED_TAG } from "@/internal/balances/allocate/allocationsAdjustedTag";
import { applyPooledBalanceCustomerProductTransitions } from "@/internal/billing/v2/pooledBalances/execute/applyPooledBalanceCustomerProductTransitions";
import type { StripeWebhookContext } from "../../../webhookMiddlewares/stripeWebhookContext";
import { addBillingChangeTag } from "../../common/billingChangeTags";
import type { StripeSubscriptionUpdatedContext } from "../stripeSubscriptionUpdatedContext";
import { classifyPooledBalanceTransitionProducts } from "./classifyPooledBalanceTransitionProducts";

export const applyPooledBalanceTransitions = async ({
	ctx,
	eventContext,
}: {
	ctx: StripeWebhookContext;
	eventContext: StripeSubscriptionUpdatedContext;
}) => {
	const { outgoingCustomerProducts, incomingCustomerProducts } =
		classifyPooledBalanceTransitionProducts({
			updatedCustomerProducts: eventContext.updatedCustomerProducts,
			insertedCustomerProducts: eventContext.insertedCustomerProducts,
		});

	const hasPools =
		(eventContext.fullCustomer.pooled_customer_entitlements?.length ?? 0) > 0;
	const hasTransitions =
		outgoingCustomerProducts.length > 0 || incomingCustomerProducts.length > 0;
	if (!hasPools && !hasTransitions) return;

	eventContext.results.pooledBalances =
		await applyPooledBalanceCustomerProductTransitions({
			ctx,
			fullCustomer: eventContext.fullCustomer,
			outgoingCustomerProducts,
			incomingCustomerProducts,
			now: eventContext.nowMs,
		});

	if (!eventContext.fullCustomer.balance_allocations) return;
	const { adjusted } = await refreshAllocationScaleAfterWrite({
		ctx,
		customerId:
			eventContext.fullCustomer.id || eventContext.fullCustomer.internal_id,
		notify: false,
		now: eventContext.nowMs,
	});
	if (adjusted) addBillingChangeTag(eventContext, ALLOCATIONS_ADJUSTED_TAG);
};

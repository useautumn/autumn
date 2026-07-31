import { applyPooledBalanceCustomerProductTransitions } from "@/internal/billing/v2/pooledBalances/execute/applyPooledBalanceCustomerProductTransitions";
import type { StripeWebhookContext } from "../../../webhookMiddlewares/stripeWebhookContext";
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

	await applyPooledBalanceCustomerProductTransitions({
		ctx,
		fullCustomer: eventContext.fullCustomer,
		outgoingCustomerProducts,
		incomingCustomerProducts,
		now: eventContext.nowMs,
	});
};

import { isAutumnOriginatedStripeEvent } from "@/external/stripe/common/autumnStripeIdempotency.js";
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

	const hasPools =
		(eventContext.fullCustomer.pooled_customer_entitlements?.length ?? 0) > 0;
	const hasTransitions =
		outgoingCustomerProducts.length > 0 || incomingCustomerProducts.length > 0;
	const autumnOriginated = isAutumnOriginatedStripeEvent({
		event: ctx.stripeEvent,
	});
	if (autumnOriginated && !hasPools && !hasTransitions) return;

	eventContext.results.pooledBalances =
		await applyPooledBalanceCustomerProductTransitions({
			ctx,
			fullCustomer: eventContext.fullCustomer,
			outgoingCustomerProducts,
			incomingCustomerProducts,
			now: eventContext.nowMs,
		});
};

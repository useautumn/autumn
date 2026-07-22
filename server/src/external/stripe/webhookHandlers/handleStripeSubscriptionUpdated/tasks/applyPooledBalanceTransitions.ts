import {
	CusProductStatus,
	customerProductHasActiveStatus,
	type FullCusProduct,
} from "@autumn/shared";
import { applyPooledBalanceCustomerProductTransitions } from "@/internal/billing/v2/pooledBalances/execute/applyPooledBalanceCustomerProductTransitions";
import type { StripeWebhookContext } from "../../../webhookMiddlewares/stripeWebhookContext";
import type { StripeSubscriptionUpdatedContext } from "../stripeSubscriptionUpdatedContext";

export const applyPooledBalanceTransitions = async ({
	ctx,
	eventContext,
}: {
	ctx: StripeWebhookContext;
	eventContext: StripeSubscriptionUpdatedContext;
}) => {
	const outgoingCustomerProducts = new Map<string, FullCusProduct>();
	const incomingCustomerProducts = new Map<string, FullCusProduct>();

	for (const {
		customerProduct,
		updates,
	} of eventContext.updatedCustomerProducts) {
		if (updates.status === CusProductStatus.Expired) {
			outgoingCustomerProducts.set(customerProduct.id, customerProduct);
		}
		if (updates.status === CusProductStatus.Active) {
			incomingCustomerProducts.set(customerProduct.id, {
				...customerProduct,
				...updates,
			} as FullCusProduct);
		}
	}

	for (const customerProduct of eventContext.insertedCustomerProducts) {
		if (customerProductHasActiveStatus(customerProduct)) {
			incomingCustomerProducts.set(customerProduct.id, customerProduct);
		}
	}

	await applyPooledBalanceCustomerProductTransitions({
		ctx,
		fullCustomer: eventContext.fullCustomer,
		outgoingCustomerProducts: Array.from(outgoingCustomerProducts.values()),
		incomingCustomerProducts: Array.from(incomingCustomerProducts.values()),
		now: eventContext.nowMs,
	});
};

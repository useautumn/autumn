import {
	ACTIVE_STATUSES,
	CusProductStatus,
	type FullCusProduct,
	type FullCustomer,
	isCustomerProductPaidRecurring,
} from "@autumn/shared";
import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { fetchStripeCustomerForBilling } from "@/internal/billing/v2/providers/stripe/setup/fetchStripeCustomerForBilling";
import { setupFullCustomerContext } from "@/internal/billing/v2/setup/setupFullCustomerContext";

export type RestoreContext = {
	fullCustomer: FullCustomer;
	stripeCustomer?: Stripe.Customer;
	subscriptionIds: string[];
};

const isPaidRecurring = (customerProduct: FullCusProduct) => {
	const hasActiveStatus =
		ACTIVE_STATUSES.includes(customerProduct.status) ||
		customerProduct.status === CusProductStatus.Trialing;
	if (!hasActiveStatus) return false;

	return isCustomerProductPaidRecurring(customerProduct);
};

export const setupRestoreContext = async ({
	ctx,
	customerId,
	subscriptionIdsFilter,
}: {
	ctx: AutumnContext;
	customerId: string;
	subscriptionIdsFilter?: string[];
}): Promise<RestoreContext> => {
	const fullCustomer = await setupFullCustomerContext({
		ctx,
		params: { customer_id: customerId },
	});

	const { stripeCus } = await fetchStripeCustomerForBilling({
		ctx,
		fullCus: fullCustomer,
	});

	const allowedSubscriptionIds = subscriptionIdsFilter
		? new Set(subscriptionIdsFilter)
		: null;

	const uniqueSubscriptionIds = new Set<string>();
	for (const customerProduct of fullCustomer.customer_products) {
		if (!isPaidRecurring(customerProduct)) continue;
		const subscriptionId = customerProduct.subscription_ids?.[0];
		if (!subscriptionId) continue;
		if (allowedSubscriptionIds && !allowedSubscriptionIds.has(subscriptionId))
			continue;
		uniqueSubscriptionIds.add(subscriptionId);
	}

	return {
		fullCustomer,
		stripeCustomer: stripeCus,
		subscriptionIds: [...uniqueSubscriptionIds],
	};
};

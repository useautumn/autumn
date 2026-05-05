import {
	ACTIVE_STATUSES,
	CusProductStatus,
	cusProductToPrices,
	type FullCusProduct,
	type FullCustomer,
	isFreeProduct,
	isOneOffProduct,
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

	const prices = cusProductToPrices({ cusProduct: customerProduct });
	return !isOneOffProduct({ prices }) && !isFreeProduct({ prices });
};

export const setupRestoreContext = async ({
	ctx,
	customerId,
}: {
	ctx: AutumnContext;
	customerId: string;
}): Promise<RestoreContext> => {
	const fullCustomer = await setupFullCustomerContext({
		ctx,
		params: { customer_id: customerId },
	});

	const { stripeCus } = await fetchStripeCustomerForBilling({
		ctx,
		fullCus: fullCustomer,
	});

	const uniqueSubscriptionIds = new Set<string>();
	for (const customerProduct of fullCustomer.customer_products) {
		if (!isPaidRecurring(customerProduct)) continue;
		const subscriptionId = customerProduct.subscription_ids?.[0];
		if (subscriptionId) uniqueSubscriptionIds.add(subscriptionId);
	}

	return {
		fullCustomer,
		stripeCustomer: stripeCus,
		subscriptionIds: [...uniqueSubscriptionIds],
	};
};

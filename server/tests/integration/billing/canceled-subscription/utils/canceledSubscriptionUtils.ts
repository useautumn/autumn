import { findActiveCustomerProductById } from "@autumn/shared";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import type Stripe from "stripe";
import { CusService } from "@/internal/customers/CusService";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import { timeout } from "@/utils/genUtils";

const WEBHOOK_SETTLE_MS = 12_000;

/**
 * Produces the drifted state these suites are about: an ACTIVE Autumn customer
 * product whose `subscription_ids` point at a canceled Stripe subscription.
 * Unlinking before the cancel makes `sub.deleted` a no-op — the same shape
 * production lands in when Autumn's own post-cancel bookkeeping never runs.
 */
export const linkCustomerProductToCanceledSubscription = async ({
	ctx,
	customerId,
	productId,
}: {
	ctx: TestContext;
	customerId: string;
	productId: string;
}) => {
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});

	const customerProduct = findActiveCustomerProductById({
		fullCus: fullCustomer,
		productId,
	});

	const subscriptionIds = customerProduct?.subscription_ids ?? [];
	if (!customerProduct || subscriptionIds.length === 0) {
		throw new Error(`No active subscribed customer product for ${productId}`);
	}

	const stripeCustomerId = fullCustomer.processor?.id;
	if (!stripeCustomerId) throw new Error("Missing stripe customer id");

	await CusProductService.update({
		ctx,
		cusProductId: customerProduct.id,
		updates: { subscription_ids: [] },
	});

	await ctx.stripeCli.subscriptions.cancel(subscriptionIds[0]);
	await timeout(WEBHOOK_SETTLE_MS);

	await CusProductService.update({
		ctx,
		cusProductId: customerProduct.id,
		updates: { subscription_ids: subscriptionIds },
	});

	return { subscriptionId: subscriptionIds[0], stripeCustomerId };
};

export const listStripeSubscriptions = async ({
	ctx,
	stripeCustomerId,
}: {
	ctx: TestContext;
	stripeCustomerId: string;
}): Promise<Stripe.Subscription[]> => {
	const { data } = await ctx.stripeCli.subscriptions.list({
		customer: stripeCustomerId,
		status: "all",
	});
	return data;
};

export const getSubscriptionIdsForProduct = async ({
	ctx,
	customerId,
	productId,
}: {
	ctx: TestContext;
	customerId: string;
	productId: string;
}) => {
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	return findActiveCustomerProductById({ fullCus: fullCustomer, productId })
		?.subscription_ids;
};

import { expect } from "bun:test";
import {
	CusProductStatus,
	findActiveCustomerProductById,
} from "@autumn/shared";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import type Stripe from "stripe";
import { CusService } from "@/internal/customers/CusService";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";

const getStripeCustomerId = async ({
	ctx,
	customerId,
}: {
	ctx: TestContext;
	customerId: string;
}) => {
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	const stripeCustomerId = fullCustomer.processor?.id;
	if (!stripeCustomerId)
		throw new Error(`${customerId} has no Stripe customer`);
	return { fullCustomer, stripeCustomerId };
};

export const findStripeSubscriptionByStatus = async ({
	ctx,
	customerId,
	status,
}: {
	ctx: TestContext;
	customerId: string;
	status: Stripe.Subscription.Status;
}) => {
	const { stripeCustomerId } = await getStripeCustomerId({ ctx, customerId });
	const { data } = await ctx.stripeCli.subscriptions.list({
		customer: stripeCustomerId,
		status,
	});
	const subscription = data[0];
	if (!subscription) throw new Error(`No ${status} subscription`);
	return subscription;
};

/** The old subscription is cancelled and the plan lives on exactly one new subscription. */
export const expectSubscriptionReplaced = async ({
	ctx,
	customerId,
	productId,
	replacedSubscriptionId,
	replacedStatus = "canceled",
}: {
	ctx: TestContext;
	customerId: string;
	productId: string;
	replacedSubscriptionId: string;
	replacedStatus?: Stripe.Subscription.Status;
}) => {
	const replaced = await ctx.stripeCli.subscriptions.retrieve(
		replacedSubscriptionId,
	);
	expect(replaced.status).toBe(replacedStatus);

	const { fullCustomer, stripeCustomerId } = await getStripeCustomerId({
		ctx,
		customerId,
	});
	const { data: liveSubscriptions } = await ctx.stripeCli.subscriptions.list({
		customer: stripeCustomerId,
	});
	expect(liveSubscriptions).toHaveLength(1);
	const [newSubscription] = liveSubscriptions;
	expect(newSubscription?.id).not.toBe(replacedSubscriptionId);

	const customerProduct = findActiveCustomerProductById({
		fullCus: fullCustomer,
		productId,
	});
	expect(customerProduct?.subscription_ids).toEqual([newSubscription!.id]);

	const pendingRows = await CusProductService.list({
		db: ctx.db,
		internalCustomerId: fullCustomer.internal_id,
		inStatuses: [CusProductStatus.Pending],
	});
	expect(pendingRows).toHaveLength(0);
};

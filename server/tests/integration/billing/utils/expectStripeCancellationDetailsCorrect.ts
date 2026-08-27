import { expect } from "bun:test";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import type Stripe from "stripe";
import { getStripeSubscription } from "./stripeSubscriptionUtils";

type StripeCancellationDetails = NonNullable<
	Stripe.Subscription.CancellationDetails
>;

/**
 * Asserts Stripe stored cancellation_details on the customer's subscription.
 */
export const expectStripeCancellationDetailsCorrect = async ({
	ctx,
	customerId,
	subscriptionId,
	feedback,
	comment,
}: {
	ctx: TestContext;
	customerId: string;
	subscriptionId?: string;
	feedback?: StripeCancellationDetails["feedback"];
	comment?: StripeCancellationDetails["comment"];
}) => {
	const stripeSubscriptionId =
		subscriptionId ??
		(await getStripeSubscription({ customerId })).subscription.id;

	const subscription = await ctx.stripeCli.subscriptions.retrieve(
		stripeSubscriptionId,
	);

	if (feedback !== undefined) {
		expect(subscription.cancellation_details?.feedback).toBe(feedback);
	}

	if (comment !== undefined) {
		expect(subscription.cancellation_details?.comment).toBe(comment);
	}
};

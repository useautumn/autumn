import { ErrCode, RecaseError } from "@autumn/shared";
import type Stripe from "stripe";

export const advanceStripeTestClock = async ({
	stripe,
	stripeCustomerId,
	frozenTime,
}: {
	stripe: Stripe;
	stripeCustomerId: string;
	frozenTime: number;
}) => {
	const customer = await stripe.customers.retrieve(stripeCustomerId, {
		expand: ["test_clock"],
	});
	if (customer.deleted) {
		throw new RecaseError({
			message: "Stripe customer has been deleted",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
	if (customer.livemode) {
		throw new RecaseError({
			message: "Test clocks cannot be advanced for live-mode Stripe customers",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
	const clock = customer.test_clock;
	if (!clock || typeof clock === "string") {
		throw new RecaseError({
			message: "Customer does not have a Stripe test clock",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
	const frozenTimeSeconds = Math.floor(frozenTime / 1000);
	if (frozenTimeSeconds <= clock.frozen_time) {
		throw new RecaseError({
			message: "frozen_time must be later than the current test clock time",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
	return stripe.testHelpers.testClocks.advance(clock.id, {
		frozen_time: frozenTimeSeconds,
	});
};

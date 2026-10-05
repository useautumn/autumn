import { ErrCode, RecaseError } from "@autumn/shared";
import type Stripe from "stripe";

const CLOCK_READY_POLL_MS = 1000;
const CLOCK_READY_MAX_POLLS = 30;

const waitForStripeTestClockReady = async ({
	stripe,
	clockId,
}: {
	stripe: Stripe;
	clockId: string;
}) => {
	for (let poll = 0; poll < CLOCK_READY_MAX_POLLS; poll++) {
		const clock = await stripe.testHelpers.testClocks.retrieve(clockId);
		if (clock.status === "ready") return clock;
		await Bun.sleep(CLOCK_READY_POLL_MS);
	}
	throw new RecaseError({
		message: `Stripe test clock ${clockId} is not ready yet; retry shortly`,
		code: ErrCode.InvalidRequest,
		statusCode: 409,
	});
};

const readAttachedStripeTestClockId = async ({
	stripe,
	stripeCustomerId,
}: {
	stripe: Stripe;
	stripeCustomerId: string;
}) => {
	const customer = await stripe.customers.retrieve(stripeCustomerId);
	if (customer.deleted || !customer.test_clock) return null;
	return typeof customer.test_clock === "string"
		? customer.test_clock
		: customer.test_clock.id;
};

/** Stripe only attaches a clock to an existing customer at the current time, and the attach is permanent. */
export const attachStripeTestClock = async ({
	stripe,
	stripeCustomerId,
}: {
	stripe: Stripe;
	stripeCustomerId: string;
}): Promise<Stripe.TestHelpers.TestClock> => {
	let clockId: string;
	try {
		const clock = await stripe.testHelpers.testClocks.create({
			frozen_time: Math.floor(Date.now() / 1000),
			customer: stripeCustomerId,
		} as Stripe.TestHelpers.TestClockCreateParams);
		clockId = clock.id;
	} catch (error) {
		const concurrentClockId = await readAttachedStripeTestClockId({
			stripe,
			stripeCustomerId,
		}).catch(() => null);
		if (!concurrentClockId) throw error;
		clockId = concurrentClockId;
	}
	return waitForStripeTestClockReady({ stripe, clockId });
};

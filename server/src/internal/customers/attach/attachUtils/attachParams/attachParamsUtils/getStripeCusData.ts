import type { AppEnv, Customer, Organization } from "@autumn/shared";
import type Stripe from "stripe";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import {
	createStripeCusIfNotExists,
	listCusPaymentMethods,
} from "@/external/stripe/stripeCusUtils.js";

export const getStripeCusData = async ({
	stripeCli,
	db,
	org,
	env,
	customer,
	logger,
	allowNoStripe,
}: {
	stripeCli: Stripe;
	db: DrizzleCli;
	org: Organization;
	env: AppEnv;
	customer: Customer;
	logger: any;
	allowNoStripe?: boolean;
}) => {
	if (allowNoStripe && !customer.processor?.id) {
		return { stripeCus: undefined, paymentMethod: null, now: undefined };
	}

	const stripeCus = (await createStripeCusIfNotExists({
		db,
		org,
		env,
		customer,
		logger,
	})) as Stripe.Customer;

	const testClock = stripeCus.test_clock as Stripe.TestHelpers.TestClock | null;

	// let now = testClock ? testClock.frozen_time * 1000 : Date.now();
	const now = testClock ? testClock.frozen_time * 1000 : undefined;

	let paymentMethod = stripeCus.invoice_settings
		?.default_payment_method as Stripe.PaymentMethod | null;

	if (!paymentMethod) {
		const paymentMethods = await listCusPaymentMethods({
			stripeCli,
			stripeId: stripeCus.id,
		});

		paymentMethod = paymentMethods.length ? paymentMethods[0] : null;
	}

	return { stripeCus, paymentMethod, now };
};

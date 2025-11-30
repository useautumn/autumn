import type { Customer } from "@autumn/shared";
import type { AutumnContext } from "@server/honoUtils/HonoEnv";
import type Stripe from "stripe";
import {
	createStripeCusIfNotExists,
	listCusPaymentMethods,
} from "@/external/stripe/stripeCusUtils.js";
import { createStripeCli } from "../../../../../../external/connect/createStripeCli";

export const getStripeCusData = async ({
	ctx,
	customer,
	allowNoStripe,
}: {
	ctx: AutumnContext;
	customer: Customer;
	allowNoStripe?: boolean;
}) => {
	if (allowNoStripe && !customer.processor?.id) {
		return { stripeCus: undefined, paymentMethod: null, now: undefined };
	}

	const { logger, db, org, env } = ctx;
	const stripeCli = createStripeCli({ org, env });

	const stripeCus = await createStripeCusIfNotExists({
		db,
		org,
		env,
		customer,
		logger,
	});

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

import type { Customer } from "@autumn/shared";
import type { AutumnContext } from "@server/honoUtils/HonoEnv";
import type Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { getOrCreateStripeCustomer } from "@/external/stripe/customers";
import { listCusPaymentMethods } from "@/external/stripe/stripeCusUtils.js";

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
		return { stripeCus: undefined, paymentMethod: undefined, now: undefined };
	}

	const { org, env } = ctx;
	const stripeCli = createStripeCli({ org, env });

	const stripeCus = await getOrCreateStripeCustomer({
		ctx,
		customer,
	});

	const testClock = stripeCus.test_clock as Stripe.TestHelpers.TestClock | null;

	// let now = testClock ? testClock.frozen_time * 1000 : Date.now();
	const now = testClock ? testClock.frozen_time * 1000 : undefined;

	const invoiceSettingsPaymentMethod =
		stripeCus.invoice_settings?.default_payment_method;

	let paymentMethod: Stripe.PaymentMethod | undefined =
		invoiceSettingsPaymentMethod &&
		typeof invoiceSettingsPaymentMethod !== "string"
			? invoiceSettingsPaymentMethod
			: undefined;

	if (!paymentMethod) {
		const paymentMethods = await listCusPaymentMethods({
			stripeCli,
			stripeId: stripeCus.id,
		});

		paymentMethod = paymentMethods.length ? paymentMethods[0] : undefined;
	}

	return { stripeCus, paymentMethod, now };
};

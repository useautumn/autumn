import type { FullCustomer } from "@autumn/shared";
import type Stripe from "stripe";
import { createStripeCli } from "../../../../../external/connect/createStripeCli";
import {
	createStripeCusIfNotExists,
	listCusPaymentMethods,
} from "../../../../../external/stripe/stripeCusUtils";
import type { AutumnContext } from "../../../../../honoUtils/HonoEnv";

export const fetchStripeCustomerForAttach = async ({
	ctx,
	fullCus,
}: {
	ctx: AutumnContext;
	fullCus: FullCustomer;
}) => {
	const { logger, db, org, env } = ctx;
	const stripeCli = createStripeCli({ org, env });

	const stripeCus = await createStripeCusIfNotExists({
		db,
		org,
		env,
		customer: fullCus,
		logger,
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

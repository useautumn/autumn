/**
 * invoices.reissue with invoice.payment_method_id.
 *
 * Contract:
 *   the chosen card is the replacement's default and is what gets charged,
 *   over both the subscription's and the customer's default
 *   a card that is not the customer's, or a send-invoice replacement, is rejected
 */

import { expect, test } from "bun:test";
import type { ApiListInvoiceV1 } from "@autumn/shared";
import { ErrCode } from "@autumn/shared";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import type Stripe from "stripe";
import { stripeInvoiceToStripeSubscriptionId } from "@/external/stripe/invoices/utils/convertStripeInvoice";

const paidCardInvoiceScenario = async ({
	customerId,
	planId,
}: {
	customerId: string;
	planId: string;
}) => {
	const pro = products.pro({
		id: planId,
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const { autumnV2_3, customer } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});
	const { list } = (await autumnV2_3.post("/invoices.list", {
		customer_id: customerId,
	})) as { list: ApiListInvoiceV1[] };
	return {
		autumnV2_3,
		original: list[0],
		stripeCusId: customer.processor?.id ?? "",
	};
};

test(`${chalk.yellowBright("invoices.reissue: payment_method_id charges the chosen card over the subscription and customer defaults")}`, async () => {
	const { autumnV2_3, original, stripeCusId } = await paidCardInvoiceScenario({
		customerId: "inv-reissue-chosen-pm",
		planId: "pro-reissue-chosen-pm",
	});
	const originalStripe = await ctx.stripeCli.invoices.retrieve(
		original.stripe_id,
	);
	const stripeSubId = stripeInvoiceToStripeSubscriptionId(originalStripe);
	if (!stripeSubId) throw new Error("original invoice has no subscription");

	const subscriptionCard = await ctx.stripeCli.paymentMethods.attach(
		"pm_card_visa",
		{ customer: stripeCusId },
	);
	const customerCard = await ctx.stripeCli.paymentMethods.attach(
		"pm_card_mastercard",
		{ customer: stripeCusId },
	);
	const chosenCard = await ctx.stripeCli.paymentMethods.attach("pm_card_amex", {
		customer: stripeCusId,
	});
	await ctx.stripeCli.subscriptions.update(stripeSubId, {
		default_payment_method: subscriptionCard.id,
	});
	await ctx.stripeCli.customers.update(stripeCusId, {
		invoice_settings: { default_payment_method: customerCard.id },
	});

	const { invoice } = (await autumnV2_3.post("/invoices.reissue", {
		invoice_id: original.id,
		invoice: { payment_method_id: chosenCard.id },
		lines: { add: [{ description: "Setup", amount: 10 }] },
	})) as { invoice: ApiListInvoiceV1 };

	const replacement = await ctx.stripeCli.invoices.retrieve(invoice.stripe_id, {
		expand: ["payments.data.payment.payment_intent"],
	});
	expect(replacement.status).toBe("paid");
	expect(replacement.default_payment_method).toBe(chosenCard.id);
	const paymentIntent = replacement.payments?.data[0]?.payment.payment_intent as
		| Stripe.PaymentIntent
		| null
		| undefined;
	expect(paymentIntent?.payment_method).toBe(chosenCard.id);
});

test(`${chalk.yellowBright("invoices.reissue: payment_method_id rejects another customer's card and send-invoice replacements")}`, async () => {
	const { autumnV2_3, original, stripeCusId } = await paidCardInvoiceScenario({
		customerId: "inv-reissue-chosen-pm-invalid",
		planId: "pro-reissue-chosen-pm-invalid",
	});
	const stranger = await ctx.stripeCli.customers.create({
		email: "stranger@example.com",
	});
	const strangerCard = await ctx.stripeCli.paymentMethods.attach(
		"pm_card_visa",
		{ customer: stranger.id },
	);
	const ownCard = await ctx.stripeCli.paymentMethods.attach("pm_card_visa", {
		customer: stripeCusId,
	});

	for (const body of [
		{ invoice: { payment_method_id: strangerCard.id } },
		{ invoice: { payment_method_id: ownCard.id }, net_terms_days: 7 },
	]) {
		for (const preview of [true, false]) {
			await expectAutumnError({
				errCode: ErrCode.InvalidRequest,
				func: () =>
					autumnV2_3.post("/invoices.reissue", {
						invoice_id: original.id,
						preview,
						...body,
					}),
			});
		}
	}

	expect(
		(await ctx.stripeCli.invoices.retrieve(original.stripe_id)).metadata
			?.autumn_reissued_to,
	).toBeUndefined();
	await ctx.stripeCli.customers.del(stranger.id);
});

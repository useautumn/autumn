import { expect, test } from "bun:test";
import type {
	ReissueInvoiceParams,
	ReissueInvoiceResponse,
} from "@autumn/shared";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { stripeInvoiceToStripeSubscriptionId } from "@/external/stripe/invoices/utils/convertStripeInvoice";
import { expectReissueTaxPreviewCorrect } from "./utils/expectReissueTaxPreviewCorrect";
import { setupTaxedRenewal } from "./utils/setupTaxedRenewal";
import { snapshotTaxPreviewState } from "./utils/snapshotTaxPreviewState";

test("invoices.reissue: subscription payment method address wins and invalid billing never falls through", async () => {
	const scenario = await setupTaxedRenewal({
		customerId: "preview-address-precedence",
	});
	const { ctx, stripeCustomerId, original, autumnV2_4 } = scenario;
	const stripe = ctx.stripeCli;
	const originalStripe = await stripe.invoices.retrieve(original.stripe_id);
	const subscriptionId = stripeInvoiceToStripeSubscriptionId(originalStripe);
	if (!subscriptionId) throw new Error("Expected a subscription renewal");

	const customerCard = await stripe.paymentMethods.create({
		type: "card",
		card: { token: "tok_visa" },
		billing_details: {
			address: {
				country: "FR",
				line1: "1 Rue de Test",
				city: "Paris",
				postal_code: "75001",
			},
		},
	});
	const subscriptionCard = await stripe.paymentMethods.create({
		type: "card",
		card: { token: "tok_visa" },
		billing_details: {
			address: {
				country: "AU",
				line1: "1 Test Street",
				city: "Sydney",
				postal_code: "2000",
				state: "NSW",
			},
		},
	});
	await stripe.paymentMethods.attach(customerCard.id, {
		customer: stripeCustomerId,
	});
	await stripe.paymentMethods.attach(subscriptionCard.id, {
		customer: stripeCustomerId,
	});
	await stripe.customers.update(stripeCustomerId, {
		address: "",
		shipping: "",
		invoice_settings: { default_payment_method: customerCard.id },
	});
	await stripe.subscriptions.update(subscriptionId, {
		default_payment_method: subscriptionCard.id,
	});

	const params = {
		invoice_id: original.id,
		net_terms_days: 14,
		invoice: { automatic_tax: true },
	} satisfies ReissueInvoiceParams;
	const beforeRejectedPreview = await snapshotTaxPreviewState({ scenario });
	await expectAutumnError({
		errMessage: "location",
		func: () =>
			autumnV2_4.post("/invoices.reissue", {
				...params,
				customer: { address: { postal_code: "90210" } },
				preview: true,
			} satisfies ReissueInvoiceParams),
	});
	expect(await snapshotTaxPreviewState({ scenario })).toEqual(
		beforeRejectedPreview,
	);

	const beforePreview = await snapshotTaxPreviewState({ scenario });
	const preview = (await autumnV2_4.post("/invoices.reissue", {
		...params,
		preview: true,
	} satisfies ReissueInvoiceParams)) as ReissueInvoiceResponse;
	expectReissueTaxPreviewCorrect({ response: preview, total: 22 });
	expect(await snapshotTaxPreviewState({ scenario })).toEqual(beforePreview);

	const result = (await autumnV2_4.post(
		"/invoices.reissue",
		params,
	)) as ReissueInvoiceResponse;
	if (!result.invoice) throw new Error("Reissue returned no invoice");
	expectReissueTaxPreviewCorrect({
		response: preview,
		total: 22,
		issued: await stripe.invoices.retrieve(result.invoice.stripe_id),
	});
	expect((await stripe.invoices.retrieve(original.stripe_id)).status).toBe(
		"void",
	);
}, 600_000);

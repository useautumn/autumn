import { test } from "bun:test";
import type {
	ReissueInvoiceParams,
	ReissueInvoiceResponse,
} from "@autumn/shared";
import type Stripe from "stripe";
import { stripeInvoiceToStripeSubscriptionId } from "@/external/stripe/invoices/utils/convertStripeInvoice";
import {
	expectPreviewCustomerUnchanged,
	expectStripeTaxPreviewCorrect,
} from "./utils/expectStripeTaxPreviewCorrect";
import { setupTaxedRenewal } from "./utils/setupTaxedRenewal";

const addresses = {
	FR: {
		country: "FR",
		line1: "1 Rue de Test",
		city: "Paris",
		postal_code: "75001",
	},
	AU: {
		country: "AU",
		line1: "1 Test Street",
		city: "Sydney",
		postal_code: "2000",
		state: "NSW",
	},
};

test("Stripe preview: unsaved tax details match issued replacements without customer writes", async () => {
	const scenario = await setupTaxedRenewal({
		customerId: "preview-tax-parity",
	});
	const { ctx, stripeCustomerId, autumnV2_4 } = scenario;
	const stripe = ctx.stripeCli;
	let original = scenario.original;
	const cases: {
		address: Stripe.AddressParam;
		taxIds: Stripe.InvoiceCreatePreviewParams.CustomerDetails.TaxId[];
		total: number;
	}[] = [
		{ address: addresses.FR, taxIds: [], total: 2400 },
		{ address: addresses.AU, taxIds: [], total: 2200 },
		{
			address: addresses.FR,
			taxIds: [{ type: "eu_vat", value: "FR12345678901" }],
			total: 2000,
		},
	];
	for (const { address, taxIds, total } of cases) {
		const before = await stripe.customers.retrieve(stripeCustomerId);
		const beforeTaxIds = await stripe.customers.listTaxIds(stripeCustomerId, {
			limit: 100,
		});
		const preview = await stripe.invoices.createPreview({
			customer_details: { address, tax_ids: taxIds, tax_exempt: "none" },
			automatic_tax: { enabled: true },
			currency: "usd",
			discounts: "",
			invoice_items: [
				{
					amount: 2000,
					currency: "usd",
					description: "Replacement line",
					tax_behavior: "exclusive",
					tax_code: "txcd_10000000",
				},
			],
		});
		expectStripeTaxPreviewCorrect({ preview, total });
		expectPreviewCustomerUnchanged({
			before,
			after: await stripe.customers.retrieve(stripeCustomerId),
			beforeTaxIds: beforeTaxIds.data,
			afterTaxIds: (
				await stripe.customers.listTaxIds(stripeCustomerId, { limit: 100 })
			).data,
		});
		const result = (await autumnV2_4.post("/invoices.reissue", {
			invoice_id: original.id,
			net_terms_days: 14,
			customer: { address, tax_ids: taxIds },
		} satisfies ReissueInvoiceParams)) as ReissueInvoiceResponse;
		if (!result.invoice) throw new Error("Reissue returned no invoice");
		original = result.invoice;
		expectStripeTaxPreviewCorrect({
			preview,
			total,
			issued: await stripe.invoices.retrieve(original.stripe_id),
		});
	}

	const untaxed = (await autumnV2_4.post("/invoices.reissue", {
		invoice_id: original.id,
		invoice: { tax_rate_id: null },
		customer: { address: addresses.FR, tax_ids: [] },
	} satisfies ReissueInvoiceParams)) as ReissueInvoiceResponse;
	if (!untaxed.invoice) throw new Error("Untaxed reissue returned no invoice");
	const untaxedStripe = await stripe.invoices.retrieve(
		untaxed.invoice.stripe_id,
	);
	expectStripeTaxPreviewCorrect({
		preview: untaxedStripe,
		total: 2000,
		automaticTax: false,
	});
	const enabledPreview = await stripe.invoices.createPreview({
		customer_details: {
			address: addresses.FR,
			tax_ids: [],
			tax_exempt: "none",
		},
		automatic_tax: { enabled: true },
		currency: "usd",
		discounts: "",
		invoice_items: [
			{
				amount: 2000,
				currency: "usd",
				tax_behavior: "exclusive",
				tax_code: "txcd_10000000",
			},
		],
	});
	const draft = await stripe.invoices.create({
		customer: stripeCustomerId,
		subscription: stripeInvoiceToStripeSubscriptionId(untaxedStripe),
		automatic_tax: { enabled: true },
		collection_method: "send_invoice",
		days_until_due: 14,
		auto_advance: false,
	});
	await stripe.invoiceItems.create({
		customer: stripeCustomerId,
		invoice: draft.id,
		amount: 2000,
		currency: "usd",
		tax_behavior: "exclusive",
		tax_code: "txcd_10000000",
	});
	const issued = await stripe.invoices.finalizeInvoice(draft.id, {
		auto_advance: false,
	});
	expectStripeTaxPreviewCorrect({
		preview: enabledPreview,
		total: 2400,
		issued,
	});
}, 600_000);

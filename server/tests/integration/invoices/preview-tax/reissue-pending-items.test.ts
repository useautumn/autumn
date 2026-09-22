import { test } from "bun:test";
import type {
	ReissueInvoiceParams,
	ReissueInvoiceResponse,
} from "@autumn/shared";
import { expectStripeTaxPreviewCorrect } from "./utils/expectStripeTaxPreviewCorrect";
import { setupTaxedRenewal } from "./utils/setupTaxedRenewal";

test("invoices.reissue: excludes unrelated pending items like a standalone preview", async () => {
	const address = {
		country: "FR",
		line1: "1 Rue de Test",
		city: "Paris",
		postal_code: "75001",
	};
	const { ctx, stripeCustomerId, original, autumnV2_4 } =
		await setupTaxedRenewal({
			customerId: "preview-pending-isolation",
		});
	const stripe = ctx.stripeCli;
	const pending = await stripe.invoiceItems.create({
		customer: stripeCustomerId,
		amount: 77700,
		currency: "usd",
		tax_behavior: "exclusive",
		description: "Unrelated pending charge",
	});
	try {
		const preview = await stripe.invoices.createPreview({
			customer_details: { address, tax_ids: [], tax_exempt: "none" },
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
		expectStripeTaxPreviewCorrect({ preview, total: 2400 });
		const response = (await autumnV2_4.post("/invoices.reissue", {
			invoice_id: original.id,
			net_terms_days: 14,
			customer: { address },
		} satisfies ReissueInvoiceParams)) as ReissueInvoiceResponse;
		if (!response.invoice) throw new Error("Reissue returned no invoice");
		expectStripeTaxPreviewCorrect({
			preview,
			total: 2400,
			issued: await stripe.invoices.retrieve(response.invoice.stripe_id),
		});
	} finally {
		const remaining = await stripe.invoiceItems.retrieve(pending.id);
		if (!remaining.invoice) await stripe.invoiceItems.del(pending.id);
	}
}, 600_000);

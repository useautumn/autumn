import { expect, test } from "bun:test";
import type {
	ReissueInvoiceParams,
	ReissueInvoiceResponse,
} from "@autumn/shared";
import { expectReissueTaxPreviewCorrect } from "./utils/expectReissueTaxPreviewCorrect";
import { setupTaxedRenewal } from "./utils/setupTaxedRenewal";
import { snapshotTaxPreviewState } from "./utils/snapshotTaxPreviewState";

test("invoices.reissue: excludes unrelated pending items and leaves them unassigned", async () => {
	const address = {
		country: "FR",
		line1: "1 Rue de Test",
		city: "Paris",
		postal_code: "75001",
	};
	const scenario = await setupTaxedRenewal({
		customerId: "preview-pending-isolation",
	});
	const { ctx, stripeCustomerId, original, autumnV2_4 } = scenario;
	const stripe = ctx.stripeCli;
	const pending = await stripe.invoiceItems.create({
		customer: stripeCustomerId,
		amount: 77700,
		currency: "usd",
		tax_behavior: "exclusive",
		description: "Unrelated pending charge",
	});
	try {
		const beforePreview = await snapshotTaxPreviewState({ scenario });
		const preview = (await autumnV2_4.post("/invoices.reissue", {
			invoice_id: original.id,
			net_terms_days: 14,
			customer: { address, tax_ids: [] },
			preview: true,
		} satisfies ReissueInvoiceParams)) as ReissueInvoiceResponse;
		expectReissueTaxPreviewCorrect({ response: preview, total: 24 });
		expect(await snapshotTaxPreviewState({ scenario })).toEqual(beforePreview);
		expect((await stripe.invoiceItems.retrieve(pending.id)).invoice).toBeNull();
		const response = (await autumnV2_4.post("/invoices.reissue", {
			invoice_id: original.id,
			net_terms_days: 14,
			customer: { address },
		} satisfies ReissueInvoiceParams)) as ReissueInvoiceResponse;
		if (!response.invoice) throw new Error("Reissue returned no invoice");
		expectReissueTaxPreviewCorrect({
			response: preview,
			total: 24,
			issued: await stripe.invoices.retrieve(response.invoice.stripe_id),
		});
		const remaining = await stripe.invoiceItems.retrieve(pending.id);
		expect(remaining.invoice).toBeNull();
		expect(remaining.amount).toBe(pending.amount);
		expect(remaining.customer).toBe(pending.customer);
		expect(remaining.description).toBe(pending.description);
	} finally {
		const remaining = await stripe.invoiceItems.retrieve(pending.id);
		if (!remaining.invoice) await stripe.invoiceItems.del(pending.id);
	}
}, 600_000);

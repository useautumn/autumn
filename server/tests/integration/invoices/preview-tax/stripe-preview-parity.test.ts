import { expect, test } from "bun:test";
import type {
	ReissueInvoiceParams,
	ReissueInvoiceResponse,
} from "@autumn/shared";
import { expectReissueTaxPreviewCorrect } from "./utils/expectReissueTaxPreviewCorrect";
import { setupTaxedRenewal } from "./utils/setupTaxedRenewal";
import { snapshotTaxPreviewState } from "./utils/snapshotTaxPreviewState";

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

test("invoices.reissue: unsaved country and VAT previews match issuance without writes", async () => {
	const scenario = await setupTaxedRenewal({
		customerId: "preview-tax-parity",
	});
	const { ctx, autumnV2_4 } = scenario;
	const stripe = ctx.stripeCli;
	let original = scenario.original;
	const cases = [
		{ address: addresses.AU, taxIds: [], total: 22 },
		{ address: addresses.FR, taxIds: [], total: 24 },
		{
			address: addresses.FR,
			taxIds: [{ type: "eu_vat", value: "FR12345678901" }],
			total: 20,
		},
	];
	const baseline = await snapshotTaxPreviewState({ scenario });
	expect(baseline.invoices[0].status).toBe("open");
	expect(baseline.invoices[0].automatic_tax.enabled).toBe(true);
	expect(baseline.invoices[0].total).toBe(2400);
	const previews: ReissueInvoiceResponse[] = [];
	for (const { address, taxIds, total } of cases) {
		const response = (await autumnV2_4.post("/invoices.reissue", {
			invoice_id: original.id,
			preview: true,
			net_terms_days: 14,
			customer: { address, tax_ids: taxIds },
		} satisfies ReissueInvoiceParams)) as ReissueInvoiceResponse;
		expectReissueTaxPreviewCorrect({ response, total });
		expect(await snapshotTaxPreviewState({ scenario })).toEqual(baseline);
		previews.push(response);
	}
	const addedLines = Array.from({ length: 11 }, (_, index) => ({
		description: `Synthetic extra line ${index + 1}`,
		amount: 1,
	}));
	const paginatedPreview = (await autumnV2_4.post("/invoices.reissue", {
		invoice_id: original.id,
		preview: true,
		invoice: { tax_rate_id: null },
		lines: { add: addedLines },
	} satisfies ReissueInvoiceParams)) as ReissueInvoiceResponse;
	expect(paginatedPreview.invoice).toBeNull();
	expect(paginatedPreview.preview.lines).toHaveLength(12);
	expect(paginatedPreview.preview.subtotal).toBe(31);
	expect(paginatedPreview.preview.total).toBe(31);
	expect(paginatedPreview.preview.amount_due).toBe(31);
	for (const line of addedLines) {
		expect(paginatedPreview.preview.lines).toContainEqual(
			expect.objectContaining(line),
		);
	}
	expect(await snapshotTaxPreviewState({ scenario })).toEqual(baseline);
	for (const [index, { address, taxIds, total }] of cases.entries()) {
		const result = (await autumnV2_4.post("/invoices.reissue", {
			invoice_id: original.id,
			net_terms_days: 14,
			customer: { address, tax_ids: taxIds },
		} satisfies ReissueInvoiceParams)) as ReissueInvoiceResponse;
		if (!result.invoice) throw new Error("Reissue returned no invoice");
		original = result.invoice;
		expectReissueTaxPreviewCorrect({
			response: previews[index],
			total,
			issued: await stripe.invoices.retrieve(original.stripe_id),
		});
	}

	const disableTaxParams = {
		invoice_id: original.id,
		invoice: { tax_rate_id: null },
		customer: { address: addresses.FR, tax_ids: [] },
	} satisfies ReissueInvoiceParams;
	const beforeDisable = await snapshotTaxPreviewState({ scenario });
	const disablePreview = (await autumnV2_4.post("/invoices.reissue", {
		...disableTaxParams,
		preview: true,
	} satisfies ReissueInvoiceParams)) as ReissueInvoiceResponse;
	expectReissueTaxPreviewCorrect({
		response: disablePreview,
		total: 20,
		automaticTax: false,
	});
	expect(await snapshotTaxPreviewState({ scenario })).toEqual(beforeDisable);
	const untaxed = (await autumnV2_4.post(
		"/invoices.reissue",
		disableTaxParams,
	)) as ReissueInvoiceResponse;
	if (!untaxed.invoice) throw new Error("Untaxed reissue returned no invoice");
	const untaxedStripe = await stripe.invoices.retrieve(
		untaxed.invoice.stripe_id,
	);
	expectReissueTaxPreviewCorrect({
		response: disablePreview,
		issued: untaxedStripe,
		total: 20,
		automaticTax: false,
	});
	const beforeEnable = await snapshotTaxPreviewState({ scenario });
	const inheritedPreview = (await autumnV2_4.post("/invoices.reissue", {
		invoice_id: untaxed.invoice.id,
		preview: true,
	} satisfies ReissueInvoiceParams)) as ReissueInvoiceResponse;
	expectReissueTaxPreviewCorrect({
		response: inheritedPreview,
		total: 20,
		automaticTax: false,
	});
	expect(await snapshotTaxPreviewState({ scenario })).toEqual(beforeEnable);
	const enableTaxParams = {
		invoice_id: untaxed.invoice.id,
		invoice: { automatic_tax: true },
	} satisfies ReissueInvoiceParams;
	const enabledPreview = (await autumnV2_4.post("/invoices.reissue", {
		...enableTaxParams,
		preview: true,
	} satisfies ReissueInvoiceParams)) as ReissueInvoiceResponse;
	expectReissueTaxPreviewCorrect({ response: enabledPreview, total: 24 });
	expect(await snapshotTaxPreviewState({ scenario })).toEqual(beforeEnable);
	const enabled = (await autumnV2_4.post(
		"/invoices.reissue",
		enableTaxParams,
	)) as ReissueInvoiceResponse;
	if (!enabled.invoice)
		throw new Error("Tax-enabled reissue returned no invoice");
	expectReissueTaxPreviewCorrect({
		response: enabledPreview,
		total: 24,
		issued: await stripe.invoices.retrieve(enabled.invoice.stripe_id),
	});
}, 600_000);

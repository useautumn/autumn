import { describe, expect, it } from "bun:test";
import type { CreateInvoicePreview } from "@autumn/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { ReissueBillingDetails } from "../../src/views/customers2/components/sheets/reissue/ReissueBillingDetails";
import { ReissuePreviewTotals } from "../../src/views/customers2/components/sheets/reissue/ReissuePreviewTotals";
import type { ReissueFormState } from "../../src/views/customers2/components/sheets/reissue/useReissueForm";

const form: ReissueFormState = {
	email: "",
	netTermsDays: "",
	templateId: null,
	taxMode: "keep",
	amounts: {},
	removedLineIds: [],
	addedLines: [],
	customFields: [],
	memo: "",
	footer: "",
	customerName: "Example Company",
	address: {
		line1: "12 Example Street",
		line2: "",
		city: "London",
		state: "",
		postal_code: "SW1A 1AA",
		country: "GB",
	},
	taxIdOptionId: "FR:eu_vat",
	taxIdValue: "FR12345678901",
};

const preview: CreateInvoicePreview = {
	currency: "usd",
	lines: [],
	subtotal: 500,
	discount_total: 0,
	tax: {
		total: 100,
		amount_inclusive: 0,
		amount_exclusive: 100,
		status: "complete",
	},
	total: 600,
	amount_due: 600,
	due_date: null,
};
const money = (amount: number) => `$${amount.toFixed(2)}`;

describe("reissue billing and tax controls", () => {
	it("keeps tax calculation, billing country and optional VAT ID together", () => {
		const html = renderToStaticMarkup(
			<ReissueBillingDetails
				form={form}
				prefill={{}}
				patch={() => {}}
				setAddress={() => {}}
			/>,
		);
		expect(html).toContain("Billing &amp; tax");
		expect(html).toContain("Tax calculation");
		expect(html).toContain("Keep current tax settings");
		expect(html).toContain("Billing country");
		expect(html).toContain("United Kingdom");
		expect(html).toContain("VAT / tax ID");
		expect(html).toContain("EU VAT registration");
		expect(html).toContain("Change type");
		expect(html).not.toContain("Search by country or type");
		expect(html).toContain("This does not select a tax rate");
	});

	it("explains that automatic tax replaces manual rates", () => {
		const html = renderToStaticMarkup(
			<ReissueBillingDetails
				form={{ ...form, taxMode: "automatic" }}
				prefill={{}}
				patch={() => {}}
				setAddress={() => {}}
			/>,
		);
		expect(html).toContain("Calculate tax automatically");
		expect(html).toContain("Replaces any existing manual tax rates");
	});

	it("keeps incomplete tax registration lists read-only", () => {
		const html = renderToStaticMarkup(
			<ReissueBillingDetails
				form={form}
				prefill={{ taxIdsIncomplete: true }}
				patch={() => {}}
				setAddress={() => {}}
			/>,
		);
		expect(html).toContain("disabled");
		expect(html).not.toContain("Change type");
		expect(html).not.toContain(">Remove<");
		expect(html).toContain("Edit registrations in Stripe");
	});
});

describe("reissue preview totals", () => {
	it("shows Stripe's subtotal, added tax and total", () => {
		const html = renderToStaticMarkup(
			<ReissuePreviewTotals preview={preview} error={null} money={money} />,
		);
		expect(html).toContain("Preview up to date");
		expect(html).toContain("$500.00");
		expect(html).toContain("$100.00");
		expect(html).toContain("$600.00");
		expect(html).not.toContain("No tax added");
	});

	it("does not claim reverse charge when the preview has no tax", () => {
		const html = renderToStaticMarkup(
			<ReissuePreviewTotals
				preview={{ ...preview, tax: null, total: 500, amount_due: 500 }}
				error={null}
				money={money}
			/>,
		);
		expect(html).toContain("No tax added in this preview");
		expect(html).not.toContain("reverse charge");
	});

	it("distinguishes inclusive tax, discounts and credit from added tax", () => {
		const html = renderToStaticMarkup(
			<ReissuePreviewTotals
				preview={{
					...preview,
					discount_total: 50,
					tax: {
						total: 75,
						amount_inclusive: 75,
						amount_exclusive: 0,
						status: "complete",
					},
					total: 450,
					amount_due: 400,
					invoice_credits: { balance: 50, applied: 50 },
				}}
				error={null}
				money={money}
			/>,
		);
		expect(html).toContain("Tax included in subtotal");
		expect(html).toContain("$75.00");
		expect(html).toContain("Discounts");
		expect(html).toContain("Credit applied");
		expect(html).toContain("Amount due");
		expect(html).toContain("$400.00");
		expect(html).not.toContain("No tax added");
	});

	it("does not show a previous total while recalculating or after an error", () => {
		for (const error of [null, "Tax calculation failed"]) {
			const html = renderToStaticMarkup(
				<ReissuePreviewTotals error={error} money={money} />,
			);
			expect(html).not.toContain("$600.00");
			expect(html).not.toContain("Preview up to date");
			expect(html).toContain(error ? "Preview unavailable" : "Recalculating");
		}
	});
});

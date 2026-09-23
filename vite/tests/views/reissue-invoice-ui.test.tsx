import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ReissueBillingDetails } from "../../src/views/customers2/components/sheets/reissue/ReissueBillingDetails";
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
		expect(html).toContain(
			"A tax ID change alone may not change the final tax amount.",
		);
		expect(html).not.toContain("Only enter an ID");
		expect(html).not.toContain("The preview updates");
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

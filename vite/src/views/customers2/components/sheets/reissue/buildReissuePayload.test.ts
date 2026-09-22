import { describe, expect, it } from "bun:test";
import type { InvoiceLineItem } from "@autumn/shared";
import { buildReissuePayload, type ReissueFormState } from "./useReissueForm";

const lineItems = [
	{ id: "li_base", description: "Pro", amount: 20 },
	{ id: "li_seats", description: "Seats", amount: 50 },
] as InvoiceLineItem[];

const prefill = {
	customerName: "Acme SAS",
	address: {
		line1: "12 Rue de Rivoli",
		city: "Paris",
		postal_code: "75004",
		country: "FR",
	},
	taxIdOptionId: "FR:eu_vat",
	taxIdValue: "FR12345678901",
};

const untouched = (): ReissueFormState => ({
	email: "",
	netTermsDays: "",
	templateId: null,
	removeTax: false,
	amounts: {},
	removedLineIds: [],
	addedLines: [],
	customFields: [],
	memo: "",
	footer: "",
	customerName: "Acme SAS",
	address: {
		line1: "12 Rue de Rivoli",
		line2: "",
		city: "Paris",
		state: "",
		postal_code: "75004",
		country: "FR",
	},
	taxIdOptionId: "FR:eu_vat",
	taxIdValue: "FR12345678901",
});

describe("buildReissuePayload", () => {
	it("sends only the invoice id when nothing was touched", () => {
		expect(
			buildReissuePayload({
				invoiceId: "inv_1",
				form: untouched(),
				prefill,
				lineItems,
			}),
		).toEqual({ invoice_id: "inv_1" });
	});

	it("turns line edits into update, remove and add", () => {
		const form = {
			...untouched(),
			amounts: { li_base: "15", li_seats: "99" },
			removedLineIds: ["li_seats"],
			addedLines: [
				{ _id: "a", description: "Onboarding", amount: "100" },
				{ _id: "b", description: "", amount: "5" },
			],
		};
		expect(
			buildReissuePayload({ invoiceId: "inv_1", form, prefill, lineItems })
				.lines,
		).toEqual({
			update: [{ id: "li_base", amount: 15 }],
			remove: ["li_seats"],
			add: [{ description: "Onboarding", amount: 100 }],
		});
	});

	it("maps the tax switch and custom fields onto invoice", () => {
		const form = {
			...untouched(),
			removeTax: true,
			customFields: [{ _id: "f", name: "PO number", value: "PO-4417" }],
			memo: "Corrected",
		};
		expect(
			buildReissuePayload({ invoiceId: "inv_1", form, prefill, lineItems })
				.invoice,
		).toEqual({
			tax_rate_id: null,
			custom_fields: [{ name: "PO number", value: "PO-4417" }],
			memo: "Corrected",
		});
	});

	it("sends customer fields only when they differ from the prefill", () => {
		const form = {
			...untouched(),
			address: { ...untouched().address, country: "DE", city: "Berlin" },
			taxIdOptionId: "DE:eu_vat",
			taxIdValue: "DE123456789",
		};
		expect(
			buildReissuePayload({ invoiceId: "inv_1", form, prefill, lineItems })
				.customer,
		).toEqual({
			address: {
				line1: "12 Rue de Rivoli",
				line2: "",
				city: "Berlin",
				state: "",
				postal_code: "75004",
				country: "DE",
			},
			tax_ids: [{ type: "eu_vat", value: "DE123456789" }],
		});
	});

	it("sends blanks for cleared address fields and an empty tax_ids for a removed registration", () => {
		const prefillWithLine2 = {
			...prefill,
			address: { ...prefill.address, line2: "Bâtiment B" },
		};
		const form = {
			...untouched(),
			address: { ...untouched().address, line2: "" },
			taxIdOptionId: null,
			taxIdValue: "",
		};
		expect(
			buildReissuePayload({
				invoiceId: "inv_1",
				form,
				prefill: prefillWithLine2,
				lineItems,
			}).customer,
		).toEqual({
			address: {
				line1: "12 Rue de Rivoli",
				line2: "",
				city: "Paris",
				state: "",
				postal_code: "75004",
				country: "FR",
			},
			tax_ids: [],
		});
	});

	it("does not send tax_ids when there was none and none was entered", () => {
		const form = {
			...untouched(),
			taxIdOptionId: "DE:eu_vat",
			taxIdValue: "",
		};
		expect(
			buildReissuePayload({
				invoiceId: "inv_1",
				form,
				prefill: { ...prefill, taxIdOptionId: null, taxIdValue: null },
				lineItems,
			}).customer,
		).toBeUndefined();
	});
});

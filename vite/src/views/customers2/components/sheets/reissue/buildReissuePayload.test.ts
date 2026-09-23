import { describe, expect, it } from "bun:test";
import type { InvoiceLineItem } from "@autumn/shared";
import { getReissuePreviewState } from "./getReissuePreviewState";
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
	taxMode: "keep",
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
	paymentMethodId: null,
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

	it("maps no tax and custom fields onto invoice", () => {
		const form: ReissueFormState = {
			...untouched(),
			taxMode: "none",
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

	it.each([
		["keep", undefined],
		["automatic", { automatic_tax: true }],
		["none", { tax_rate_id: null }],
	] as const)(
		"sends the %s tax override in previews and reissues",
		(taxMode, invoice) => {
			for (const preview of [false, true]) {
				expect(
					buildReissuePayload({
						invoiceId: "inv_1",
						form: { ...untouched(), taxMode },
						prefill,
						lineItems,
						preview,
					}),
				).toEqual({
					invoice_id: "inv_1",
					...(invoice ? { invoice } : {}),
					...(preview ? { preview: true } : {}),
				});
			}
		},
	);

	it("includes edited country, postcode and VAT in the preview without changing the reissue payload", () => {
		const args = {
			invoiceId: "inv_1",
			form: {
				...untouched(),
				address: {
					...untouched().address,
					country: "DE",
					postal_code: "10115",
				},
				taxIdOptionId: "DE:eu_vat",
				taxIdValue: "DE123456789",
			},
			prefill,
			lineItems,
		};
		const preview = buildReissuePayload({ ...args, preview: true });
		expect(preview).toEqual({ ...buildReissuePayload(args), preview: true });
		expect(preview.customer).toEqual({
			address: { ...untouched().address, country: "DE", postal_code: "10115" },
			tax_ids: [{ type: "eu_vat", value: "DE123456789" }],
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

	it("sends the untouched registrations back alongside the edited one", () => {
		const prefillWithTwo = {
			...prefill,
			otherTaxIds: [{ type: "fr_siren", value: "123456789" }],
		};
		const edited = { ...untouched(), taxIdValue: "FR99999999999" };
		expect(
			buildReissuePayload({
				invoiceId: "inv_1",
				form: edited,
				prefill: prefillWithTwo,
				lineItems,
			}).customer,
		).toEqual({
			tax_ids: [
				{ type: "eu_vat", value: "FR99999999999" },
				{ type: "fr_siren", value: "123456789" },
			],
		});

		const cleared = { ...untouched(), taxIdOptionId: null, taxIdValue: "" };
		expect(
			buildReissuePayload({
				invoiceId: "inv_1",
				form: cleared,
				prefill: prefillWithTwo,
				lineItems,
			}).customer,
		).toEqual({ tax_ids: [{ type: "fr_siren", value: "123456789" }] });
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

describe("reissue payment method", () => {
	const chargingPrefill = { ...prefill, chargesAutomatically: true };
	const withCard = { ...untouched(), paymentMethodId: "pm_chosen" };

	it("sends the chosen card for a card-charged replacement", () => {
		expect(
			buildReissuePayload({
				invoiceId: "inv_1",
				form: withCard,
				prefill: chargingPrefill,
				lineItems,
			}).invoice,
		).toEqual({ payment_method_id: "pm_chosen" });
	});

	it("drops the card when nothing will be charged", () => {
		for (const [form, nextPrefill] of [
			[{ ...withCard, netTermsDays: "7" }, chargingPrefill],
			[withCard, prefill],
		] as const) {
			expect(
				buildReissuePayload({
					invoiceId: "inv_1",
					form,
					prefill: nextPrefill,
					lineItems,
				}).invoice?.payment_method_id,
			).toBeUndefined();
		}
	});
});

describe("getReissuePreviewState", () => {
	const ready = () => ({
		form: untouched(),
		prefill,
		currentPayload: "current",
		debouncedPayload: "current",
		successfulPayload: "current",
		isFetching: false,
		error: null,
	});

	it("requires a successful matching preview before showing an amount or enabling reissue", () => {
		expect(getReissuePreviewState(ready()).ready).toBe(true);
		for (const change of [
			{ successfulPayload: undefined },
			{ currentPayload: "edited" },
			{ successfulPayload: "previous" },
			{ isFetching: true },
			{ error: "Tax calculation failed" },
		]) {
			expect(getReissuePreviewState({ ...ready(), ...change }).ready).toBe(
				false,
			);
		}
	});

	it("allows intentional tax ID removal only after its preview succeeds", () => {
		const form = { ...untouched(), taxIdOptionId: null, taxIdValue: "" };
		const currentPayload = JSON.stringify(
			buildReissuePayload({
				invoiceId: "inv_1",
				form,
				prefill,
				lineItems,
				preview: true,
			}),
		);
		expect(JSON.parse(currentPayload).customer.tax_ids).toEqual([]);
		expect(
			getReissuePreviewState({ ...ready(), form, currentPayload }).ready,
		).toBe(false);
		expect(
			getReissuePreviewState({
				...ready(),
				form,
				currentPayload,
				debouncedPayload: currentPayload,
				successfulPayload: currentPayload,
			}).ready,
		).toBe(true);
	});

	it("does not require editing a saved tax registration missing from the type picker", () => {
		expect(
			getReissuePreviewState({
				...ready(),
				prefill: { ...prefill, taxIdOptionId: null },
				form: { ...untouched(), taxIdOptionId: null },
			}).ready,
		).toBe(true);
	});

	it("stops recalculating and shows an error for incomplete country, postcode, VAT and line edits", () => {
		for (const change of [
			{ address: { ...untouched().address, country: "" } },
			{ address: { ...untouched().address, postal_code: "" } },
			{ taxIdOptionId: "DE:eu_vat", taxIdValue: "" },
			{ taxIdOptionId: null, taxIdValue: "DE123456789" },
			{ addedLines: [{ _id: "new", description: "Charge", amount: "" }] },
			{ amounts: { li_base: "not-a-number" } },
		]) {
			const state = getReissuePreviewState({
				...ready(),
				form: { ...untouched(), ...change },
			});
			expect(state.ready).toBe(false);
			expect(state.recalculating).toBe(false);
			expect(state.error).toBeTruthy();
		}
	});

	it("clears an outdated error while recalculating but preserves an error for the current request", () => {
		expect(
			getReissuePreviewState({ ...ready(), error: "Invalid VAT" }),
		).toMatchObject({
			ready: false,
			recalculating: false,
			error: "Invalid VAT",
		});
		expect(
			getReissuePreviewState({
				...ready(),
				currentPayload: "fixed",
				error: "Invalid VAT",
			}),
		).toMatchObject({
			ready: false,
			recalculating: true,
			error: null,
		});
	});
});

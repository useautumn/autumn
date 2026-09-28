import { expect, test } from "bun:test";
import {
	billingDetailsChanges,
	billingDetailsToFormValues,
} from "../../../../src/views/customers/customer/components/updateCustomer/billingDetails/billingDetailsFormValues";

const germanVat = { type: "eu_vat", value: "DE123456789" };
const frenchVat = { type: "eu_vat", value: "FRAB123456789" };
const ukVat = { type: "gb_vat", value: "GB123456789" };

const initial = billingDetailsToFormValues({
	address: null,
	tax_ids: [germanVat, ukVat],
	tax_exempt: "none",
	invoice_settings: { custom_fields: [] },
});

test("untouched form sends no billing details", () => {
	expect(billingDetailsChanges({ initial, current: initial })).toBeUndefined();
});

test("editing one tax ID removes the old value and adds the new one, keeping the rest", () => {
	const current = { ...initial, tax_ids: [frenchVat, ukVat] };

	expect(billingDetailsChanges({ initial, current })).toEqual({
		tax_ids: { add: [frenchVat], remove: [germanVat] },
	});
});

test("an empty new row is ignored and a deleted row is removed", () => {
	const current = { ...initial, tax_ids: [ukVat, { type: "", value: "" }] };

	expect(billingDetailsChanges({ initial, current })).toEqual({
		tax_ids: { remove: [germanVat] },
	});
});

test("stray whitespace already in Stripe is not treated as an edit", () => {
	const withSpaces = billingDetailsToFormValues({
		address: null,
		tax_ids: [{ type: "eu_vat", value: " DE123456789 " }],
		tax_exempt: "none",
		invoice_settings: {
			custom_fields: [{ name: "PO Number ", value: "PO-1" }],
		},
	});

	expect(
		billingDetailsChanges({ initial: withSpaces, current: withSpaces }),
	).toBeUndefined();
});

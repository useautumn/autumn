import { expect, test } from "bun:test";
import { customers } from "../../../src/tools/customers.js";

test("updateCustomer accepts billing_details", () => {
	const parsed = customers.schemas.updateCustomer.parse({
		customer_id: "customer_123",
		billing_details: {
			address: { line1: "1 Main St", country: "DE" },
			tax_ids: {
				add: [{ type: "eu_vat", value: "DE123456789" }],
				remove: [{ type: "gb_vat", value: "GB123456789" }],
			},
			tax_exempt: "reverse",
			invoice_settings: {
				custom_fields: [{ name: "PO Number", value: "4500463831" }],
			},
		},
	});

	expect(parsed.billing_details?.tax_ids).toEqual({
		add: [{ type: "eu_vat", value: "DE123456789" }],
		remove: [{ type: "gb_vat", value: "GB123456789" }],
	});
});

test("getCustomer accepts the billing_details expand", () => {
	const parsed = customers.schemas.getCustomer.parse({
		customer_id: "customer_123",
		expand: ["billing_details"],
	});

	expect(parsed.expand).toEqual(["billing_details"]);
});

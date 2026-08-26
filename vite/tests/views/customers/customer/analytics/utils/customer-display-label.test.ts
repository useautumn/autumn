import { expect, test } from "bun:test";
import { customerDisplayLabel } from "@/views/customers/customer/analytics/utils/customerDisplayLabel";

const customerNames = {
	named: { name: "Acme Inc", email: "ops@acme.com" },
	emailOnly: { name: null, email: "solo@acme.com" },
	blankName: { name: "", email: "blank@acme.com" },
	bare: { name: null, email: null },
};

test("prefers the customer name", () => {
	expect(customerDisplayLabel({ customerId: "named", customerNames })).toBe(
		"Acme Inc",
	);
});

test("falls back to email when the name is missing or empty", () => {
	expect(customerDisplayLabel({ customerId: "emailOnly", customerNames })).toBe(
		"solo@acme.com",
	);
	expect(customerDisplayLabel({ customerId: "blankName", customerNames })).toBe(
		"blank@acme.com",
	);
});

test("falls back to the id when neither name nor email is known", () => {
	expect(customerDisplayLabel({ customerId: "bare", customerNames })).toBe(
		"bare",
	);
	expect(customerDisplayLabel({ customerId: "missing", customerNames })).toBe(
		"missing",
	);
	expect(customerDisplayLabel({ customerId: "cus_1" })).toBe("cus_1");
});

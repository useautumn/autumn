import { describe, expect, test } from "bun:test";
import { getCustomerPageTitle } from "@/views/customers2/customer/CustomerPageTitle";

describe("getCustomerPageTitle", () => {
	test("uses the customer name", () => {
		expect(
			getCustomerPageTitle({ name: "Brian Kerr", email: null, id: "brian" }),
		).toBe("Brian Kerr – Autumn");
	});

	test("falls back to the email, then ID", () => {
		expect(
			getCustomerPageTitle({
				name: null,
				email: "brian@resend.com",
				id: "brian",
			}),
		).toBe("brian@resend.com – Autumn");
		expect(getCustomerPageTitle({ name: null, email: null, id: "brian" })).toBe(
			"brian – Autumn",
		);
	});
});

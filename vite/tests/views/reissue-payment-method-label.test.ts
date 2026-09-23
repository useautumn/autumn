import { describe, expect, it } from "bun:test";
import { paymentMethodToLabel } from "../../src/views/customers2/components/sheets/reissue/paymentMethodToLabel";

describe("reissue payment method labels", () => {
	it("shows brand, last four, expiry and the default marker", () => {
		expect(
			paymentMethodToLabel({
				id: "pm_1",
				type: "card",
				brand: "visa",
				last4: "4242",
				exp_month: 3,
				exp_year: 2031,
				is_default: true,
			}),
		).toBe("Visa •••• 4242 · 03/31 (default)");
		expect(
			paymentMethodToLabel({
				id: "pm_2",
				type: "us_bank_account",
				brand: null,
				last4: "6789",
				exp_month: null,
				exp_year: null,
				is_default: false,
			}),
		).toBe("Us bank account •••• 6789");
	});
});

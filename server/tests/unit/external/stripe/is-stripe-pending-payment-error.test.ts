import { describe, expect, test } from "bun:test";
import Stripe from "stripe";
import { isStripePendingPaymentError } from "@/external/stripe/common/utils/isStripePendingPaymentError.js";

const stripeError = (message: string) =>
	new Stripe.errors.StripeInvalidRequestError({
		message,
		type: "invalid_request_error",
	});

describe("isStripePendingPaymentError", () => {
	test("matches the original Stripe wording", () => {
		expect(
			isStripePendingPaymentError(
				stripeError(
					"Invoices with pending payments waiting to clear cannot be paid, voided, or marked uncollectible.",
				),
			),
		).toBe(true);
	});

	test("matches the current Stripe wording", () => {
		expect(
			isStripePendingPaymentError(
				stripeError(
					"This invoice can't be modified while a payment on it is still pending. Wait for the payment to clear, then try again.",
				),
			),
		).toBe(true);
	});

	test("does not match other invoice errors", () => {
		expect(
			isStripePendingPaymentError(
				stripeError("Invoices with `paid` payments cannot be voided."),
			),
		).toBe(false);
	});

	test("does not match non-errors", () => {
		expect(isStripePendingPaymentError("payment on it is still pending")).toBe(
			false,
		);
	});
});

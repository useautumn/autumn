import { describe, expect, test } from "bun:test";
import { AppEnv } from "@autumn/shared";
import { getStripeInvoiceLink } from "./linkUtils";

describe("getStripeInvoiceLink", () => {
	const baseArgs = {
		env: AppEnv.Sandbox,
		accountId: "acct_123",
	};

	test("works when stripeInvoice is an object with id", () => {
		const result = getStripeInvoiceLink({
			stripeInvoice: { id: "in_abc123" },
			...baseArgs,
		});
		expect(result).toBe(
			"https://dashboard.stripe.com/acct_123/test/invoices/in_abc123",
		);
		expect(result).not.toContain("undefined");
	});

	test("works when stripeInvoice is an object with stripe_id", () => {
		const result = getStripeInvoiceLink({
			stripeInvoice: { stripe_id: "in_abc123" },
			...baseArgs,
		});
		expect(result).toBe(
			"https://dashboard.stripe.com/acct_123/test/invoices/in_abc123",
		);
		expect(result).not.toContain("undefined");
	});

	test("works when stripeInvoice is a string (attach v2 flow)", () => {
		const result = getStripeInvoiceLink({
			stripeInvoice: "in_abc123",
			...baseArgs,
		});
		expect(result).toBe(
			"https://dashboard.stripe.com/acct_123/test/invoices/in_abc123",
		);
		expect(result).not.toContain("undefined");
	});

	test("works with live env (no /test prefix)", () => {
		const result = getStripeInvoiceLink({
			stripeInvoice: "in_abc123",
			env: AppEnv.Live,
			accountId: "acct_123",
		});
		expect(result).toBe(
			"https://dashboard.stripe.com/acct_123/invoices/in_abc123",
		);
	});

	test("works without accountId", () => {
		const result = getStripeInvoiceLink({
			stripeInvoice: "in_abc123",
			env: AppEnv.Sandbox,
		});
		expect(result).toBe("https://dashboard.stripe.com/test/invoices/in_abc123");
	});
});

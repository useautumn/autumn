/**
 * applyInvoiceCredits: how much of a customer's Stripe credit balance an
 * invoice consumes, and what is left to pay.
 *
 * Contract:
 *   no credits                  -> amount due is the total, credits untouched
 *   credit below the total      -> all of it applies, remainder is due
 *   credit above the total      -> only the total applies, nothing due
 *   zero or negative total      -> nothing applies, nothing due
 */

import { describe, expect, test } from "bun:test";
import { applyInvoiceCredits } from "@/internal/billing/v2/utils/billingPlan/preview/invoiceCredits/applyInvoiceCredits";

const usd = (balance: number) => ({ balance, currency: "usd" });

describe("applyInvoiceCredits", () => {
	test("without credits the whole total is due", () => {
		expect(applyInvoiceCredits({ total: 540 })).toEqual({
			credits: undefined,
			amountDue: 540,
		});
	});

	test("a zero balance applies nothing", () => {
		expect(applyInvoiceCredits({ total: 540, credits: usd(0) })).toEqual({
			credits: { balance: 0, currency: "usd", applied: 0 },
			amountDue: 540,
		});
	});

	test("credit below the total is fully applied", () => {
		expect(applyInvoiceCredits({ total: 540, credits: usd(265.36) })).toEqual({
			credits: { balance: 265.36, currency: "usd", applied: 265.36 },
			amountDue: 274.64,
		});
	});

	test("credit above the total is capped at the total", () => {
		expect(applyInvoiceCredits({ total: 20, credits: usd(265.36) })).toEqual({
			credits: { balance: 265.36, currency: "usd", applied: 20 },
			amountDue: 0,
		});
	});

	test("credit equal to the total leaves nothing due", () => {
		expect(applyInvoiceCredits({ total: 265.36, credits: usd(265.36) })).toEqual(
			{
				credits: { balance: 265.36, currency: "usd", applied: 265.36 },
				amountDue: 0,
			},
		);
	});

	test("a zero total consumes no credit", () => {
		expect(applyInvoiceCredits({ total: 0, credits: usd(265.36) })).toEqual({
			credits: { balance: 265.36, currency: "usd", applied: 0 },
			amountDue: 0,
		});
	});

	test("a negative total never produces a negative amount due", () => {
		expect(applyInvoiceCredits({ total: -15, credits: usd(265.36) })).toEqual({
			credits: { balance: 265.36, currency: "usd", applied: 0 },
			amountDue: 0,
		});
	});

	test("fractions stay exact", () => {
		expect(applyInvoiceCredits({ total: 0.3, credits: usd(0.1) })).toEqual({
			credits: { balance: 0.1, currency: "usd", applied: 0.1 },
			amountDue: 0.2,
		});
	});
});

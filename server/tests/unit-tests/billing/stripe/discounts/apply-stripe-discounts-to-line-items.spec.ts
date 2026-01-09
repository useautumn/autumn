/**
 * Unit tests for applyStripeDiscountsToLineItems function.
 *
 * Tests the main orchestrator that applies multiple discounts to line items,
 * delegating to percent-off and amount-off handlers as appropriate.
 */

import { describe, expect, test } from "bun:test";
import type { LineItem, StripeDiscountWithCoupon } from "@autumn/shared";
import { discounts } from "@tests/utils/fixtures/db/discounts";
import { lineItems as lineItemFixtures } from "@tests/utils/fixtures/db/lineItems";
import chalk from "chalk";
import { applyStripeDiscountsToLineItems } from "@/internal/billing/v2/providers/stripe/utils/discounts/applyStripeDiscountsToLineItems";

// ============ TESTS ============

describe(chalk.yellowBright("applyStripeDiscountsToLineItems"), () => {
	describe(chalk.cyan("Empty inputs"), () => {
		test("empty line items returns empty array", () => {
			const lineItems: LineItem[] = [];
			const discountList = [discounts.twentyPercentOff()];

			const result = applyStripeDiscountsToLineItems({
				lineItems,
				discounts: discountList,
			});

			expect(result).toHaveLength(0);
		});

		test("empty discounts returns unchanged line items", () => {
			const lineItems = [lineItemFixtures.charge({ amount: 100 })];
			const discountList: StripeDiscountWithCoupon[] = [];

			const result = applyStripeDiscountsToLineItems({
				lineItems,
				discounts: discountList,
			});

			expect(result).toHaveLength(1);
			expect(result[0].finalAmount).toBe(100);
			expect(result[0].discounts).toHaveLength(0);
		});
	});

	describe(chalk.cyan("Single discount types"), () => {
		test("single percent_off discount applied correctly", () => {
			const lineItems = [lineItemFixtures.charge({ amount: 100 })];
			const discountList = [
				discounts.percentOff({ percentOff: 25, couponId: "coupon_25" }),
			];

			const result = applyStripeDiscountsToLineItems({
				lineItems,
				discounts: discountList,
			});

			expect(result[0].finalAmount).toBe(75); // 100 - 25
			expect(result[0].discounts).toHaveLength(1);
			expect(result[0].discounts[0].amountOff).toBe(25);
			expect(result[0].discounts[0].percentOff).toBe(25);
		});

		test("single amount_off discount applied correctly", () => {
			const lineItems = [lineItemFixtures.charge({ amount: 100 })];
			const discountList = [discounts.amountOff({ amountOffCents: 1500 })]; // $15

			const result = applyStripeDiscountsToLineItems({
				lineItems,
				discounts: discountList,
			});

			expect(result[0].finalAmount).toBe(85); // 100 - 15
			expect(result[0].discounts).toHaveLength(1);
			expect(result[0].discounts[0].amountOff).toBe(15);
		});
	});

	describe(chalk.cyan("Multiple discounts stacking"), () => {
		test("multiple percent_off discounts stack multiplicatively", () => {
			const lineItems = [lineItemFixtures.charge({ amount: 100 })];
			const discountList = [
				discounts.percentOff({ percentOff: 10, couponId: "coupon_1" }),
				discounts.percentOff({ percentOff: 20, couponId: "coupon_2" }),
			];

			const result = applyStripeDiscountsToLineItems({
				lineItems,
				discounts: discountList,
			});

			// Multiplicative stacking:
			// First discount: 100 * 10% = 10, finalAmount = 90
			// Second discount: 90 * 20% = 18, finalAmount = 72
			expect(result[0].discounts).toHaveLength(2);
			expect(result[0].discounts[0].amountOff).toBe(10);
			expect(result[0].discounts[1].amountOff).toBe(18);
			expect(result[0].finalAmount).toBe(72);
		});

		test("percent then amount discounts stack correctly", () => {
			const lineItems = [lineItemFixtures.charge({ amount: 100 })];
			const discountList = [
				discounts.twentyPercentOff(), // $20 off
				discounts.tenDollarsOff(), // $10 off
			];

			const result = applyStripeDiscountsToLineItems({
				lineItems,
				discounts: discountList,
			});

			// First: 100 * 20% = 20, finalAmount = 80
			// Second: + $10, total = 30, finalAmount = 70
			expect(result[0].discounts).toHaveLength(2);
			expect(result[0].discounts[0].amountOff).toBe(20);
			expect(result[0].discounts[1].amountOff).toBe(10);
			expect(result[0].finalAmount).toBe(70);
		});

		test("percent applied before amount regardless of input order", () => {
			const lineItems = [lineItemFixtures.charge({ amount: 100 })];
			const discountList = [
				discounts.tenDollarsOff(), // $10 off (applied second)
				discounts.twentyPercentOff(), // 20% off (applied first)
			];

			const result = applyStripeDiscountsToLineItems({
				lineItems,
				discounts: discountList,
			});

			// Percent always applied first: 100 * 20% = 20, finalAmount = 80
			// Amount applied second: + $10, total = 30, finalAmount = 70
			// Discounts array order: percent first, then amount
			expect(result[0].discounts).toHaveLength(2);
			expect(result[0].discounts[0].amountOff).toBe(20); // percent discount
			expect(result[0].discounts[0].percentOff).toBe(20);
			expect(result[0].discounts[1].amountOff).toBe(10); // amount discount
			expect(result[0].finalAmount).toBe(70);
		});
	});

	describe(chalk.cyan("Mixed percent_off and amount_off discounts"), () => {
		test("applies both discount types to multiple line items", () => {
			const lineItems = [
				lineItemFixtures.charge({ amount: 80 }),
				lineItemFixtures.charge({ amount: 20 }),
			];
			const discountList = [
				discounts.tenPercentOff(), // 10% off each
				discounts.tenDollarsOff(), // $10 distributed
			];

			const result = applyStripeDiscountsToLineItems({
				lineItems,
				discounts: discountList,
			});

			// Item 1: 80 * 10% = 8, then 80% of $10 = 8, total = 16, final = 64
			// Item 2: 20 * 10% = 2, then 20% of $10 = 2, total = 4, final = 16
			expect(result[0].discounts).toHaveLength(2);
			expect(result[0].discounts[0].amountOff).toBe(8); // 10%
			expect(result[0].discounts[1].amountOff).toBe(8); // $10 * 80%
			expect(result[0].finalAmount).toBe(64);

			expect(result[1].discounts).toHaveLength(2);
			expect(result[1].discounts[0].amountOff).toBe(2); // 10%
			expect(result[1].discounts[1].amountOff).toBe(2); // $10 * 20%
			expect(result[1].finalAmount).toBe(16);
		});
	});

	describe(chalk.cyan("Discounts with applies_to restrictions"), () => {
		test("percent discount applies to restricted products only", () => {
			const lineItems = [
				lineItemFixtures.chargeForProduct({
					stripeProductId: "prod_a",
					amount: 100,
				}),
				lineItemFixtures.chargeForProduct({
					stripeProductId: "prod_b",
					amount: 100,
				}),
			];
			const discountList = [
				discounts.fiftyPercentOff({
					appliesToProducts: ["prod_a"],
				}),
			];

			const result = applyStripeDiscountsToLineItems({
				lineItems,
				discounts: discountList,
			});

			expect(result[0].finalAmount).toBe(50); // Discounted
			expect(result[1].finalAmount).toBe(100); // Not discounted
		});

		test("amount discount applies to restricted products only", () => {
			const lineItems = [
				lineItemFixtures.chargeForProduct({
					stripeProductId: "prod_a",
					amount: 100,
				}),
				lineItemFixtures.chargeForProduct({
					stripeProductId: "prod_b",
					amount: 100,
				}),
			];
			const discountList = [
				discounts.twentyDollarsOff({
					appliesToProducts: ["prod_b"],
				}),
			];

			const result = applyStripeDiscountsToLineItems({
				lineItems,
				discounts: discountList,
			});

			expect(result[0].finalAmount).toBe(100); // Not discounted
			expect(result[1].finalAmount).toBe(80); // Discounted
		});

		test("mixed discounts with different applies_to", () => {
			const lineItems = [
				lineItemFixtures.chargeForProduct({
					stripeProductId: "prod_a",
					amount: 100,
				}),
				lineItemFixtures.chargeForProduct({
					stripeProductId: "prod_b",
					amount: 100,
				}),
			];
			const discountList = [
				discounts.twentyPercentOff({
					appliesToProducts: ["prod_a"],
				}),
				discounts.tenDollarsOff({
					appliesToProducts: ["prod_b"],
				}),
			];

			const result = applyStripeDiscountsToLineItems({
				lineItems,
				discounts: discountList,
			});

			// prod_a: 20% off = $20, final = 80
			expect(result[0].discounts).toHaveLength(1);
			expect(result[0].finalAmount).toBe(80);

			// prod_b: $10 off, final = 90
			expect(result[1].discounts).toHaveLength(1);
			expect(result[1].finalAmount).toBe(90);
		});
	});

	describe(chalk.cyan("Direction handling with multiple discounts"), () => {
		test("refunds are not discounted (discounts only apply to charges)", () => {
			const lineItems = [lineItemFixtures.refund({ amount: 100 })];
			const discountList = [
				discounts.tenPercentOff(),
				discounts.fiveDollarsOff(),
			];

			const result = applyStripeDiscountsToLineItems({
				lineItems,
				discounts: discountList,
			});

			// Refunds are skipped by discountAppliesToLineItem
			// finalAmount stays at -100, no discounts applied
			expect(result[0].discounts).toHaveLength(0);
			expect(result[0].finalAmount).toBe(-100);
		});
	});
});

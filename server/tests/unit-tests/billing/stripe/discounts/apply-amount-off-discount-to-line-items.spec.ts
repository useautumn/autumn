/**
 * Unit tests for applyAmountOffDiscountToLineItems function.
 *
 * Tests amount-off discount application including:
 * - Single and multiple line items
 * - Proportional distribution across items
 * - Separate distribution for refund vs charge groups
 * - Currency conversion from Stripe cents
 * - applies_to product restrictions
 */

import { describe, expect, test } from "bun:test";
import type { LineItem } from "@autumn/shared";
import { discounts } from "@tests/utils/fixtures/db/discounts";
import { lineItems as lineItemFixtures } from "@tests/utils/fixtures/db/lineItems";
import chalk from "chalk";
import { applyAmountOffDiscountToLineItems } from "@/internal/billing/v2/providers/stripe/utils/discounts/applyAmountOffDiscountToLineItems";

// ============ TESTS ============

describe(chalk.yellowBright("applyAmountOffDiscountToLineItems"), () => {
	describe(chalk.cyan("Single line item"), () => {
		test("$10 off (1000 cents) on single $50 charge", () => {
			const lineItems = [lineItemFixtures.charge({ amount: 50 })];
			const discount = discounts.tenDollarsOff();

			const result = applyAmountOffDiscountToLineItems({
				lineItems,
				discount,
			});

			expect(result).toHaveLength(1);
			expect(result[0].finalAmount).toBe(40); // 50 - 10
			expect(result[0].discounts).toHaveLength(1);
			expect(result[0].discounts[0].amountOff).toBe(10);
		});

		test("amount larger than total caps at zero (no negative)", () => {
			const lineItems = [lineItemFixtures.charge({ amount: 20 })];
			const discount = discounts.fiftyDollarsOff(); // $50

			const result = applyAmountOffDiscountToLineItems({
				lineItems,
				discount,
			});

			// The discount amount is still recorded as $50, but finalAmount caps at 0
			expect(result[0].discounts[0].amountOff).toBe(50);
			expect(result[0].finalAmount).toBe(0);
		});

		test("zero amount_off returns unchanged items", () => {
			const lineItems = [lineItemFixtures.charge({ amount: 100 })];
			const discount = discounts.amountOff({ amountOffCents: 0 });

			const result = applyAmountOffDiscountToLineItems({
				lineItems,
				discount,
			});

			expect(result[0].finalAmount).toBe(100);
			expect(result[0].discounts).toHaveLength(0);
		});
	});

	describe(
		chalk.cyan("Proportional distribution across multiple items"),
		() => {
			test("distributes $10 across two equal $50 items", () => {
				const lineItems = [
					lineItemFixtures.charge({ amount: 50 }),
					lineItemFixtures.charge({ amount: 50 }),
				];
				const discount = discounts.tenDollarsOff();

				const result = applyAmountOffDiscountToLineItems({
					lineItems,
					discount,
				});

				// Each item is 50% of total, so each gets $5
				expect(result[0].discounts[0].amountOff).toBe(5);
				expect(result[0].finalAmount).toBe(45);
				expect(result[1].discounts[0].amountOff).toBe(5);
				expect(result[1].finalAmount).toBe(45);
			});

			test("distributes $30 proportionally across unequal items", () => {
				const lineItems = [
					lineItemFixtures.charge({ amount: 75 }), // 75%
					lineItemFixtures.charge({ amount: 25 }), // 25%
				];
				const discount = discounts.amountOff({ amountOffCents: 3000 }); // $30

				const result = applyAmountOffDiscountToLineItems({
					lineItems,
					discount,
				});

				// First item: 75/100 * 30 = 22.5 → 23 (rounded)
				// Second item: 25/100 * 30 = 7.5 → 8 (rounded)
				expect(result[0].discounts[0].amountOff).toBe(23);
				expect(result[0].finalAmount).toBe(52); // 75 - 23
				expect(result[1].discounts[0].amountOff).toBe(8);
				expect(result[1].finalAmount).toBe(17); // 25 - 8
			});
		},
	);

	describe(chalk.cyan("Separate refund vs charge distribution"), () => {
		test("distributes discount separately for refund and charge groups", () => {
			const lineItems = [
				lineItemFixtures.charge({ amount: 100 }),
				lineItemFixtures.refund({ amount: 50 }),
			];
			const discount = discounts.twentyDollarsOff();

			const result = applyAmountOffDiscountToLineItems({
				lineItems,
				discount,
			});

			// Charge item gets full $20 (only charge in its group)
			expect(result[0].discounts[0].amountOff).toBe(20);
			expect(result[0].finalAmount).toBe(80); // 100 - 20

			// Refund item also gets full $20 (only refund in its group)
			// Refund: finalAmount = amount + discount = -50 + 20 = -30
			expect(result[1].discounts[0].amountOff).toBe(20);
			expect(result[1].finalAmount).toBe(-30);
		});

		test("distributes within charge group only (multiple charges)", () => {
			const lineItems = [
				lineItemFixtures.charge({ amount: 60 }),
				lineItemFixtures.charge({ amount: 40 }),
			];
			const discount = discounts.tenDollarsOff();

			const result = applyAmountOffDiscountToLineItems({
				lineItems,
				discount,
			});

			// First item: 60/100 * 10 = 6
			expect(result[0].discounts[0].amountOff).toBe(6);
			expect(result[0].finalAmount).toBe(54);
			// Second item: 40/100 * 10 = 4
			expect(result[1].discounts[0].amountOff).toBe(4);
			expect(result[1].finalAmount).toBe(36);
		});
	});

	describe(chalk.cyan("applies_to product restrictions"), () => {
		test("applies discount only to matching products", () => {
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
			const discount = discounts.twentyDollarsOff({
				appliesToProducts: ["prod_a"],
			});

			const result = applyAmountOffDiscountToLineItems({
				lineItems,
				discount,
			});

			// Only prod_a gets the discount
			expect(result[0].discounts).toHaveLength(1);
			expect(result[0].discounts[0].amountOff).toBe(20);
			expect(result[0].finalAmount).toBe(80);

			// prod_b unchanged
			expect(result[1].discounts).toHaveLength(0);
			expect(result[1].finalAmount).toBe(100);
		});

		test("skips items without stripeProductId when applies_to exists", () => {
			const lineItems = [lineItemFixtures.charge({ amount: 100 })];
			const discount = discounts.tenDollarsOff({
				appliesToProducts: ["prod_a"],
			});

			const result = applyAmountOffDiscountToLineItems({
				lineItems,
				discount,
			});

			expect(result[0].discounts).toHaveLength(0);
			expect(result[0].finalAmount).toBe(100);
		});
	});

	describe(chalk.cyan("Currency conversion"), () => {
		test("converts from Stripe cents to dollars (USD)", () => {
			const lineItems = [lineItemFixtures.charge({ amount: 100 })];
			const discount = discounts.amountOff({
				amountOffCents: 2500, // 2500 cents = $25
				currency: "usd",
			});

			const result = applyAmountOffDiscountToLineItems({
				lineItems,
				discount,
			});

			expect(result[0].discounts[0].amountOff).toBe(25);
			expect(result[0].finalAmount).toBe(75);
		});
	});

	describe(chalk.cyan("Existing discounts accumulation"), () => {
		test("accumulates with existing discounts", () => {
			const lineItems = [
				lineItemFixtures.withExistingDiscount({
					amount: 100,
					existingDiscountAmount: 10,
				}),
			];
			const discount = discounts.amountOff({ amountOffCents: 1500 }); // $15

			const result = applyAmountOffDiscountToLineItems({
				lineItems,
				discount,
			});

			// Total discount: 10 + 15 = 25
			// finalAmount: 100 - 25 = 75
			expect(result[0].discounts).toHaveLength(2);
			expect(result[0].discounts[0].amountOff).toBe(10);
			expect(result[0].discounts[1].amountOff).toBe(15);
			expect(result[0].finalAmount).toBe(75);
		});
	});

	describe(chalk.cyan("Edge cases"), () => {
		test("empty line items returns empty array", () => {
			const lineItems: LineItem[] = [];
			const discount = discounts.tenDollarsOff();

			const result = applyAmountOffDiscountToLineItems({
				lineItems,
				discount,
			});

			expect(result).toHaveLength(0);
		});

		test("no applicable items returns unchanged items", () => {
			const lineItems = [
				lineItemFixtures.chargeForProduct({
					stripeProductId: "prod_x",
					amount: 100,
				}),
			];
			const discount = discounts.tenDollarsOff({
				appliesToProducts: ["prod_y"], // Different product
			});

			const result = applyAmountOffDiscountToLineItems({
				lineItems,
				discount,
			});

			expect(result[0].discounts).toHaveLength(0);
			expect(result[0].finalAmount).toBe(100);
		});

		test("zero amount line items are skipped in distribution", () => {
			const lineItems = [
				lineItemFixtures.charge({ amount: 0 }),
				lineItemFixtures.charge({ amount: 100 }),
			];
			const discount = discounts.tenDollarsOff();

			const result = applyAmountOffDiscountToLineItems({
				lineItems,
				discount,
			});

			// First item has 0 proportion, gets no discount
			expect(result[0].discounts).toHaveLength(0);
			// Second item gets full $10
			expect(result[1].discounts[0].amountOff).toBe(10);
			expect(result[1].finalAmount).toBe(90);
		});
	});
});

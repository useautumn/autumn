/**
 * Unit tests for applyPercentOffDiscountToLineItems function.
 *
 * Tests percent-off discount application including:
 * - Various percent values (10%, 50%, 100%)
 * - Charge vs refund direction handling
 * - applies_to product restrictions
 * - Multiple line items
 * - Existing discount accumulation
 */

import { describe, expect, test } from "bun:test";
import type { LineItem } from "@autumn/shared";
import { discounts } from "@tests/utils/fixtures/db/discounts";
import { lineItems as lineItemFixtures } from "@tests/utils/fixtures/db/lineItems";
import chalk from "chalk";
import { applyPercentOffDiscountToLineItems } from "@/internal/billing/v2/providers/stripe/utils/discounts/applyPercentOffDiscountToLineItems";

// ============ TESTS ============

describe(chalk.yellowBright("applyPercentOffDiscountToLineItems"), () => {
	describe(chalk.cyan("Basic percent-off calculations"), () => {
		test("10% discount on single charge line item", () => {
			const lineItems = [lineItemFixtures.charge({ amount: 100 })];
			const discount = discounts.tenPercentOff();

			const result = applyPercentOffDiscountToLineItems({
				lineItems,
				discount,
			});

			expect(result).toHaveLength(1);
			expect(result[0].finalAmount).toBe(90); // 100 - 10
			expect(result[0].discounts).toHaveLength(1);
			expect(result[0].discounts[0].amountOff).toBe(10);
			expect(result[0].discounts[0].percentOff).toBe(10);
		});

		test("50% discount on single charge line item", () => {
			const lineItems = [lineItemFixtures.charge({ amount: 200 })];
			const discount = discounts.fiftyPercentOff();

			const result = applyPercentOffDiscountToLineItems({
				lineItems,
				discount,
			});

			expect(result).toHaveLength(1);
			expect(result[0].finalAmount).toBe(100); // 200 - 100
			expect(result[0].discounts[0].amountOff).toBe(100);
			expect(result[0].discounts[0].percentOff).toBe(50);
		});

		test("100% discount results in zero finalAmount", () => {
			const lineItems = [lineItemFixtures.charge({ amount: 50 })];
			const discount = discounts.hundredPercentOff();

			const result = applyPercentOffDiscountToLineItems({
				lineItems,
				discount,
			});

			expect(result).toHaveLength(1);
			expect(result[0].finalAmount).toBe(0);
			expect(result[0].discounts[0].amountOff).toBe(50);
		});

		test("zero percent_off returns unchanged items", () => {
			const lineItems = [lineItemFixtures.charge({ amount: 100 })];
			const discount = discounts.percentOff({ percentOff: 0 });

			const result = applyPercentOffDiscountToLineItems({
				lineItems,
				discount,
			});

			expect(result).toHaveLength(1);
			expect(result[0].finalAmount).toBe(100);
			expect(result[0].discounts).toHaveLength(0);
		});
	});

	describe(chalk.cyan("Direction handling"), () => {
		test("charge direction: discount reduces charge amount", () => {
			const lineItems = [lineItemFixtures.charge({ amount: 100 })];
			const discount = discounts.twentyPercentOff();

			const result = applyPercentOffDiscountToLineItems({
				lineItems,
				discount,
			});

			// Charge: finalAmount = amount - discount = 100 - 20 = 80
			expect(result[0].finalAmount).toBe(80);
		});

		test("refund direction: discount makes amount less negative", () => {
			const lineItems = [lineItemFixtures.refund({ amount: 100 })];
			const discount = discounts.twentyPercentOff();

			const result = applyPercentOffDiscountToLineItems({
				lineItems,
				discount,
			});

			// Refund: finalAmount = amount + discount = -100 + 20 = -80
			expect(result[0].finalAmount).toBe(-80);
			expect(result[0].discounts[0].amountOff).toBe(20); // |amount| * 20%
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
			const discount = discounts.fiftyPercentOff({
				appliesToProducts: ["prod_a"],
			});

			const result = applyPercentOffDiscountToLineItems({
				lineItems,
				discount,
			});

			expect(result[0].finalAmount).toBe(50); // Discounted
			expect(result[0].discounts).toHaveLength(1);
			expect(result[1].finalAmount).toBe(100); // Not discounted
			expect(result[1].discounts).toHaveLength(0);
		});

		test("skips items without stripeProductId when applies_to exists", () => {
			const lineItems = [lineItemFixtures.charge({ amount: 100 })];
			const discount = discounts.fiftyPercentOff({
				appliesToProducts: ["prod_a"],
			});

			const result = applyPercentOffDiscountToLineItems({
				lineItems,
				discount,
			});

			expect(result[0].finalAmount).toBe(100);
			expect(result[0].discounts).toHaveLength(0);
		});
	});

	describe(chalk.cyan("Multiple line items"), () => {
		test("applies percent to each line item individually", () => {
			const lineItems = [
				lineItemFixtures.charge({ amount: 100 }),
				lineItemFixtures.charge({ amount: 200 }),
				lineItemFixtures.charge({ amount: 50 }),
			];
			const discount = discounts.tenPercentOff();

			const result = applyPercentOffDiscountToLineItems({
				lineItems,
				discount,
			});

			expect(result[0].finalAmount).toBe(90); // 100 - 10
			expect(result[1].finalAmount).toBe(180); // 200 - 20
			expect(result[2].finalAmount).toBe(45); // 50 - 5
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
			const discount = discounts.twentyPercentOff();

			const result = applyPercentOffDiscountToLineItems({
				lineItems,
				discount,
			});

			// New discount: 100 * 20% = 20
			// Total discount: 10 + 20 = 30
			// finalAmount: 100 - 30 = 70
			expect(result[0].finalAmount).toBe(70);
			expect(result[0].discounts).toHaveLength(2);
			expect(result[0].discounts[0].amountOff).toBe(10);
			expect(result[0].discounts[1].amountOff).toBe(20);
		});
	});

	describe(chalk.cyan("Edge cases"), () => {
		test("empty line items returns empty array", () => {
			const lineItems: LineItem[] = [];
			const discount = discounts.twentyPercentOff();

			const result = applyPercentOffDiscountToLineItems({
				lineItems,
				discount,
			});

			expect(result).toHaveLength(0);
		});

		test("handles decimal rounding correctly", () => {
			// 33 * 10% = 3.3, should round to 3
			const lineItems = [lineItemFixtures.charge({ amount: 33 })];
			const discount = discounts.tenPercentOff();

			const result = applyPercentOffDiscountToLineItems({
				lineItems,
				discount,
			});

			expect(result[0].discounts[0].amountOff).toBe(3);
			expect(result[0].finalAmount).toBe(30);
		});

		test("zero amount line item is skipped", () => {
			const lineItems = [lineItemFixtures.charge({ amount: 0 })];
			const discount = discounts.fiftyPercentOff();

			const result = applyPercentOffDiscountToLineItems({
				lineItems,
				discount,
			});

			// 0 * 50% = 0, so itemDiscount is 0 and item is returned unchanged
			expect(result[0].finalAmount).toBe(0);
			expect(result[0].discounts).toHaveLength(0);
		});
	});
});

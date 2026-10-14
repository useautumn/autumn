import { describe, expect, test } from "bun:test";
import type { LineItem } from "@autumn/shared";
import { lineItems as lineItemFixtures } from "@tests/utils/fixtures/billing/lineItems";
import { discounts } from "@tests/utils/fixtures/db/discounts";
import chalk from "chalk";
import { applyAmountOffDiscountToLineItems } from "@/internal/billing/v2/providers/stripe/utils/discounts/applyAmountOffDiscountToLineItems";

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
			expect(result[0].amountAfterDiscounts).toBe(40);
			expect(result[0].discounts).toHaveLength(1);
			expect(result[0].discounts[0].amountOff).toBe(10);
		});

		test("amount larger than total caps at zero (no negative)", () => {
			const lineItems = [lineItemFixtures.charge({ amount: 20 })];
			const discount = discounts.fiftyDollarsOff();

			const result = applyAmountOffDiscountToLineItems({
				lineItems,
				discount,
			});

			expect(result[0].discounts[0].amountOff).toBe(50);
			expect(result[0].amountAfterDiscounts).toBe(0);
		});

		test("zero amount_off returns unchanged items", () => {
			const lineItems = [lineItemFixtures.charge({ amount: 100 })];
			const discount = discounts.amountOff({ amountOffCents: 0 });

			const result = applyAmountOffDiscountToLineItems({
				lineItems,
				discount,
			});

			expect(result[0].amountAfterDiscounts).toBe(100);
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

				expect(result[0].discounts[0].amountOff).toBe(5);
				expect(result[0].amountAfterDiscounts).toBe(45);
				expect(result[1].discounts[0].amountOff).toBe(5);
				expect(result[1].amountAfterDiscounts).toBe(45);
			});

			test("distributes $30 proportionally across unequal items", () => {
				const lineItems = [
					lineItemFixtures.charge({ amount: 75 }),
					lineItemFixtures.charge({ amount: 25 }),
				];
				const discount = discounts.amountOff({ amountOffCents: 3000 });

				const result = applyAmountOffDiscountToLineItems({
					lineItems,
					discount,
				});

				expect(result[0].discounts[0].amountOff).toBe(22.5);
				expect(result[0].amountAfterDiscounts).toBe(52.5);
				expect(result[1].discounts[0].amountOff).toBe(7.5);
				expect(result[1].amountAfterDiscounts).toBe(17.5);
			});
		},
	);

	describe(chalk.cyan("Separate refund vs charge distribution"), () => {
		test("distributes discount only to charges, not refunds", () => {
			const lineItems = [
				lineItemFixtures.charge({ amount: 100 }),
				lineItemFixtures.refund({ amount: 50 }),
			];
			const discount = discounts.twentyDollarsOff();

			const result = applyAmountOffDiscountToLineItems({
				lineItems,
				discount,
			});

			expect(result[0].discounts[0].amountOff).toBe(20);
			expect(result[0].amountAfterDiscounts).toBe(80);
			expect(result[1].discounts).toHaveLength(0);
			expect(result[1].amountAfterDiscounts).toBe(-50);
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

			expect(result[0].discounts[0].amountOff).toBe(6);
			expect(result[0].amountAfterDiscounts).toBe(54);
			expect(result[1].discounts[0].amountOff).toBe(4);
			expect(result[1].amountAfterDiscounts).toBe(36);
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

			expect(result[0].discounts).toHaveLength(1);
			expect(result[0].discounts[0].amountOff).toBe(20);
			expect(result[0].amountAfterDiscounts).toBe(80);

			expect(result[1].discounts).toHaveLength(0);
			expect(result[1].amountAfterDiscounts).toBe(100);
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
			expect(result[0].amountAfterDiscounts).toBe(100);
		});
	});

	describe(chalk.cyan("Currency conversion"), () => {
		test("converts from Stripe cents to dollars (USD)", () => {
			const lineItems = [lineItemFixtures.charge({ amount: 100 })];
			const discount = discounts.amountOff({
				amountOffCents: 2500,
				currency: "usd",
			});

			const result = applyAmountOffDiscountToLineItems({
				lineItems,
				discount,
			});

			expect(result[0].discounts[0].amountOff).toBe(25);
			expect(result[0].amountAfterDiscounts).toBe(75);
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
			const discount = discounts.amountOff({ amountOffCents: 1500 });

			const result = applyAmountOffDiscountToLineItems({
				lineItems,
				discount,
			});

			expect(result[0].discounts).toHaveLength(2);
			expect(result[0].discounts[0].amountOff).toBe(10);
			expect(result[0].discounts[1].amountOff).toBe(15);
			expect(result[0].amountAfterDiscounts).toBe(75);
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
				appliesToProducts: ["prod_y"],
			});

			const result = applyAmountOffDiscountToLineItems({
				lineItems,
				discount,
			});

			expect(result[0].discounts).toHaveLength(0);
			expect(result[0].amountAfterDiscounts).toBe(100);
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

			expect(result[0].discounts).toHaveLength(0);
			expect(result[1].discounts[0].amountOff).toBe(10);
			expect(result[1].amountAfterDiscounts).toBe(90);
		});
	});
});

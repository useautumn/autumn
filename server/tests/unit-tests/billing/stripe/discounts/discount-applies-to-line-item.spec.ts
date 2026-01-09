/**
 * Unit tests for discountAppliesToLineItem function.
 *
 * Tests the logic that determines whether a discount applies to a specific line item
 * based on the coupon's applies_to.products restriction.
 */

import { describe, expect, test } from "bun:test";
import { discounts } from "@tests/utils/fixtures/db/discounts";
import { lineItems as lineItemFixtures } from "@tests/utils/fixtures/db/lineItems";
import chalk from "chalk";
import { discountAppliesToLineItem } from "@/internal/billing/v2/providers/stripe/utils/discounts/discountAppliesToLineItem";

// ============ TESTS ============

describe(chalk.yellowBright("discountAppliesToLineItem"), () => {
	describe(chalk.cyan("No applies_to restriction"), () => {
		test("returns true when applies_to is undefined", () => {
			const lineItem = lineItemFixtures.chargeForProduct({
				stripeProductId: "prod_123",
			});
			const discount = discounts.twentyPercentOff();

			const result = discountAppliesToLineItem({ discount, lineItem });

			expect(result).toBe(true);
		});

		test("returns true when applies_to.products is empty array", () => {
			const lineItem = lineItemFixtures.chargeForProduct({
				stripeProductId: "prod_123",
			});
			const discount = discounts.percentOff({
				percentOff: 20,
				appliesToProducts: [],
			});

			const result = discountAppliesToLineItem({ discount, lineItem });

			expect(result).toBe(true);
		});

		test("returns true for line item without stripeProductId when no applies_to", () => {
			const lineItem = lineItemFixtures.charge();
			const discount = discounts.twentyPercentOff();

			const result = discountAppliesToLineItem({ discount, lineItem });

			expect(result).toBe(true);
		});
	});

	describe(chalk.cyan("With applies_to.products restriction"), () => {
		test("returns true when line item stripeProductId is in applies_to list", () => {
			const lineItem = lineItemFixtures.chargeForProduct({
				stripeProductId: "prod_123",
			});
			const discount = discounts.twentyPercentOff({
				appliesToProducts: ["prod_123", "prod_456"],
			});

			const result = discountAppliesToLineItem({ discount, lineItem });

			expect(result).toBe(true);
		});

		test("returns false when line item stripeProductId is NOT in applies_to list", () => {
			const lineItem = lineItemFixtures.chargeForProduct({
				stripeProductId: "prod_789",
			});
			const discount = discounts.twentyPercentOff({
				appliesToProducts: ["prod_123", "prod_456"],
			});

			const result = discountAppliesToLineItem({ discount, lineItem });

			expect(result).toBe(false);
		});

		test("returns false when line item has no stripeProductId but applies_to exists", () => {
			const lineItem = lineItemFixtures.charge();
			const discount = discounts.twentyPercentOff({
				appliesToProducts: ["prod_123"],
			});

			const result = discountAppliesToLineItem({ discount, lineItem });

			expect(result).toBe(false);
		});

		test("returns true when single product matches single applies_to entry", () => {
			const lineItem = lineItemFixtures.chargeForProduct({
				stripeProductId: "prod_single",
			});
			const discount = discounts.fiftyPercentOff({
				appliesToProducts: ["prod_single"],
			});

			const result = discountAppliesToLineItem({ discount, lineItem });

			expect(result).toBe(true);
		});
	});
});

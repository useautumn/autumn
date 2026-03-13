/**
 * Unit tests for subToDiscounts function.
 *
 * Tests conversion of Stripe subscription discounts to internal format:
 * - Handles undefined/null subscriptions
 * - Filters out string references (non-expanded discounts)
 * - Extracts expanded coupon objects correctly
 * - Handles multiple discounts
 */

import { describe, expect, test } from "bun:test";
import { discounts } from "@tests/utils/fixtures/db/discounts";
import { contexts } from "@tests/utils/fixtures/db/contexts";
import { stripeSubscriptions } from "@tests/utils/fixtures/stripe/subscriptions";
import chalk from "chalk";
import { subToDiscounts } from "@/internal/billing/v2/providers/stripe/utils/discounts/subToDiscounts";

const ctx = contexts.create({});

// ============ TESTS ============

describe(chalk.yellowBright("subToDiscounts"), () => {
	describe(chalk.cyan("Empty/undefined inputs"), () => {
		test("undefined subscription returns empty array", async () => {
			const result = await subToDiscounts({ ctx, sub: undefined });
			expect(result).toEqual([]);
		});

		test("subscription with empty discounts array returns empty array", async () => {
			const sub = stripeSubscriptions.create({ id: "sub_test", discounts: [] });
			const result = await subToDiscounts({ ctx, sub });
			expect(result).toEqual([]);
		});
	});

	describe(chalk.cyan("String reference filtering"), () => {
		test("filters out string discount references", async () => {
			const sub = stripeSubscriptions.create({
				id: "sub_test",
				discounts: ["di_string_ref_1", "di_string_ref_2"],
			});

			const result = await subToDiscounts({ ctx, sub });
			expect(result).toEqual([]);
		});

		test("filters out string references but keeps expanded discounts", async () => {
			const expandedDiscount = discounts.twentyPercentOff();

			const sub = stripeSubscriptions.create({
				id: "sub_test",
				discounts: ["di_string_ref", expandedDiscount],
			});

			const result = await subToDiscounts({ ctx, sub });
			expect(result).toHaveLength(1);
			expect(result[0].source.coupon.percent_off).toBe(20);
		});
	});

	describe(chalk.cyan("Coupon expansion validation"), () => {
		test("filters out discounts with string coupon reference", async () => {
			const discountWithStringCoupon = {
				id: "di_test",
				object: "discount",
				start: Date.now() / 1000,
				source: {
					coupon: "coupon_string_ref", // Not expanded
					type: "coupon",
				},
			};

			const sub = stripeSubscriptions.create({
				id: "sub_test",
				discounts: [discountWithStringCoupon as never],
			});

			const result = await subToDiscounts({ ctx, sub });
			expect(result).toEqual([]);
		});

		test("filters out discounts with missing source.coupon", async () => {
			const discountWithoutCoupon = {
				id: "di_test",
				object: "discount",
				start: Date.now() / 1000,
				source: {
					type: "coupon",
				},
			};

			const sub = stripeSubscriptions.create({
				id: "sub_test",
				discounts: [discountWithoutCoupon as never],
			});

			const result = await subToDiscounts({ ctx, sub });
			expect(result).toEqual([]);
		});
	});

	describe(chalk.cyan("Successful extraction"), () => {
		test("extracts single percent-off discount", async () => {
			const discount = discounts.twentyPercentOff({
				couponId: "coupon_20_pct",
			});
			const sub = stripeSubscriptions.create({
				id: "sub_test",
				discounts: [discount],
			});

			const result = await subToDiscounts({ ctx, sub });

			expect(result).toHaveLength(1);
			expect(result[0].source.coupon.id).toBe("coupon_20_pct");
			expect(result[0].source.coupon.percent_off).toBe(20);
			expect(result[0].source.coupon.amount_off).toBeNull();
		});

		test("extracts single amount-off discount", async () => {
			const discount = discounts.tenDollarsOff({ couponId: "coupon_10_off" });
			const sub = stripeSubscriptions.create({
				id: "sub_test",
				discounts: [discount],
			});

			const result = await subToDiscounts({ ctx, sub });

			expect(result).toHaveLength(1);
			expect(result[0].source.coupon.id).toBe("coupon_10_off");
			expect(result[0].source.coupon.amount_off).toBe(1000);
			expect(result[0].source.coupon.percent_off).toBeNull();
		});

		test("extracts multiple discounts", async () => {
			const discount1 = discounts.tenPercentOff({ couponId: "coupon_1" });
			const discount2 = discounts.fiveDollarsOff({ couponId: "coupon_2" });

			const sub = stripeSubscriptions.create({
				id: "sub_test",
				discounts: [discount1, discount2],
			});

			const result = await subToDiscounts({ ctx, sub });

			expect(result).toHaveLength(2);
			expect(result[0].source.coupon.id).toBe("coupon_1");
			expect(result[1].source.coupon.id).toBe("coupon_2");
		});

		test("preserves applies_to product restrictions", async () => {
			const discount = discounts.twentyPercentOff({
				appliesToProducts: ["prod_abc", "prod_xyz"],
			});
			const sub = stripeSubscriptions.create({
				id: "sub_test",
				discounts: [discount],
			});

			const result = await subToDiscounts({ ctx, sub });

			expect(result).toHaveLength(1);
			expect(result[0].source.coupon.applies_to?.products).toEqual([
				"prod_abc",
				"prod_xyz",
			]);
		});
	});
});

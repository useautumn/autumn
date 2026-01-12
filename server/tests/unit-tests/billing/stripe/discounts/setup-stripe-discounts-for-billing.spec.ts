/**
 * Unit tests for setupStripeDiscountsForBilling function.
 *
 * Tests discount retrieval priority logic:
 * - Subscription discounts take priority over customer discounts
 * - Falls back to customer discount when no subscription discounts
 * - Returns empty array when no discounts exist
 * - Handles edge cases (string refs, missing coupons)
 */

import { describe, expect, test } from "bun:test";
import { discounts } from "@tests/utils/fixtures/db/discounts";
import { createMockStripeCustomer } from "@tests/utils/mockUtils/customerMocks";
import { createMockStripeSubscription } from "../stripeSubscriptionMocks";
import chalk from "chalk";
import { setupStripeDiscountsForBilling } from "@/internal/billing/v2/providers/stripe/setup/setupStripeDiscountsForBilling";

// ============ TESTS ============

describe(chalk.yellowBright("setupStripeDiscountsForBilling"), () => {
	describe(chalk.cyan("No discounts"), () => {
		test("returns empty array when no subscription and no customer discount", () => {
			const customer = createMockStripeCustomer();

			const result = setupStripeDiscountsForBilling({
				stripeSubscription: undefined,
				stripeCustomer: customer,
			});

			expect(result).toEqual([]);
		});

		test("returns empty array when subscription has no discounts and customer has no discount", () => {
			const sub = createMockStripeSubscription({ id: "sub_test", discounts: [] });
			const customer = createMockStripeCustomer();

			const result = setupStripeDiscountsForBilling({
				stripeSubscription: sub,
				stripeCustomer: customer,
			});

			expect(result).toEqual([]);
		});
	});

	describe(chalk.cyan("Subscription discounts priority"), () => {
		test("returns subscription discounts when present", () => {
			const subDiscount = discounts.twentyPercentOff({ couponId: "sub_coupon" });
			const sub = createMockStripeSubscription({
				id: "sub_test",
				discounts: [subDiscount],
			});
			const customer = createMockStripeCustomer();

			const result = setupStripeDiscountsForBilling({
				stripeSubscription: sub,
				stripeCustomer: customer,
			});

			expect(result).toHaveLength(1);
			expect(result[0].source.coupon.id).toBe("sub_coupon");
			expect(result[0].source.coupon.percent_off).toBe(20);
		});

		test("returns subscription discounts even when customer has discount", () => {
			const subDiscount = discounts.tenPercentOff({ couponId: "sub_coupon" });
			const customerDiscount = discounts.fiftyPercentOff({ couponId: "cus_coupon" });

			const sub = createMockStripeSubscription({
				id: "sub_test",
				discounts: [subDiscount],
			});
			const customer = createMockStripeCustomer({ discount: customerDiscount });

			const result = setupStripeDiscountsForBilling({
				stripeSubscription: sub,
				stripeCustomer: customer,
			});

			// Should return subscription discount, not customer discount
			expect(result).toHaveLength(1);
			expect(result[0].source.coupon.id).toBe("sub_coupon");
			expect(result[0].source.coupon.percent_off).toBe(10);
		});

		test("returns multiple subscription discounts", () => {
			const discount1 = discounts.tenPercentOff({ couponId: "coupon_1" });
			const discount2 = discounts.twentyDollarsOff({ couponId: "coupon_2" });

			const sub = createMockStripeSubscription({
				id: "sub_test",
				discounts: [discount1, discount2],
			});
			const customer = createMockStripeCustomer();

			const result = setupStripeDiscountsForBilling({
				stripeSubscription: sub,
				stripeCustomer: customer,
			});

			expect(result).toHaveLength(2);
			expect(result[0].source.coupon.id).toBe("coupon_1");
			expect(result[1].source.coupon.id).toBe("coupon_2");
		});
	});

	describe(chalk.cyan("Customer discount fallback"), () => {
		test("returns customer discount when no subscription", () => {
			const customerDiscount = discounts.percentOff({
				percentOff: 30,
				couponId: "cus_coupon",
			});
			const customer = createMockStripeCustomer({ discount: customerDiscount });

			const result = setupStripeDiscountsForBilling({
				stripeSubscription: undefined,
				stripeCustomer: customer,
			});

			expect(result).toHaveLength(1);
			expect(result[0].source.coupon.id).toBe("cus_coupon");
			expect(result[0].source.coupon.percent_off).toBe(30);
		});

		test("returns customer discount when subscription has no discounts", () => {
			const customerDiscount = discounts.tenDollarsOff({ couponId: "cus_coupon" });

			const sub = createMockStripeSubscription({ id: "sub_test", discounts: [] });
			const customer = createMockStripeCustomer({ discount: customerDiscount });

			const result = setupStripeDiscountsForBilling({
				stripeSubscription: sub,
				stripeCustomer: customer,
			});

			expect(result).toHaveLength(1);
			expect(result[0].source.coupon.id).toBe("cus_coupon");
			expect(result[0].source.coupon.amount_off).toBe(1000);
		});

		test("returns customer discount when subscription discounts are all invalid", () => {
			const customerDiscount = discounts.twentyPercentOff({ couponId: "cus_coupon" });

			// Subscription with only string refs (invalid)
			const sub = createMockStripeSubscription({
				id: "sub_test",
				discounts: ["di_string_ref"],
			});
			const customer = createMockStripeCustomer({ discount: customerDiscount });

			const result = setupStripeDiscountsForBilling({
				stripeSubscription: sub,
				stripeCustomer: customer,
			});

			expect(result).toHaveLength(1);
			expect(result[0].source.coupon.id).toBe("cus_coupon");
		});
	});

	describe(chalk.cyan("Customer discount edge cases"), () => {
		test("returns empty array when customer discount has string coupon ref", () => {
			const invalidDiscount = {
				id: "di_invalid",
				object: "discount",
				start: Date.now() / 1000,
				source: {
					coupon: "coupon_string_ref", // Not expanded
					type: "coupon",
				},
			};

			const customer = createMockStripeCustomer({
				discount: invalidDiscount as never,
			});

			const result = setupStripeDiscountsForBilling({
				stripeSubscription: undefined,
				stripeCustomer: customer,
			});

			expect(result).toEqual([]);
		});

		test("returns empty array when customer discount has no source.coupon", () => {
			const invalidDiscount = {
				id: "di_invalid",
				object: "discount",
				start: Date.now() / 1000,
				source: {
					type: "coupon",
				},
			};

			const customer = createMockStripeCustomer({
				discount: invalidDiscount as never,
			});

			const result = setupStripeDiscountsForBilling({
				stripeSubscription: undefined,
				stripeCustomer: customer,
			});

			expect(result).toEqual([]);
		});
	});

	describe(chalk.cyan("Discount properties preserved"), () => {
		test("preserves applies_to restrictions from subscription discount", () => {
			const discount = discounts.twentyPercentOff({
				appliesToProducts: ["prod_a", "prod_b"],
			});
			const sub = createMockStripeSubscription({
				id: "sub_test",
				discounts: [discount],
			});
			const customer = createMockStripeCustomer();

			const result = setupStripeDiscountsForBilling({
				stripeSubscription: sub,
				stripeCustomer: customer,
			});

			expect(result[0].source.coupon.applies_to?.products).toEqual([
				"prod_a",
				"prod_b",
			]);
		});

		test("preserves applies_to restrictions from customer discount", () => {
			const discount = discounts.tenDollarsOff({
				appliesToProducts: ["prod_x"],
			});
			const customer = createMockStripeCustomer({ discount });

			const result = setupStripeDiscountsForBilling({
				stripeSubscription: undefined,
				stripeCustomer: customer,
			});

			expect(result[0].source.coupon.applies_to?.products).toEqual(["prod_x"]);
		});
	});
});

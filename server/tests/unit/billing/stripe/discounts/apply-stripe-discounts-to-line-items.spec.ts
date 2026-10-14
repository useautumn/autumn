import { describe, expect, test } from "bun:test";
import {
	BillingInterval,
	type LineItem,
	type StripeDiscountWithCoupon,
} from "@autumn/shared";
import { lineItems as lineItemFixtures } from "@tests/utils/fixtures/billing/lineItems";
import { discounts } from "@tests/utils/fixtures/db/discounts";
import chalk from "chalk";
import { applyStripeDiscountsToLineItems } from "@/internal/billing/v2/providers/stripe/utils/discounts/applyStripeDiscountsToLineItems";

const startsAt = Date.UTC(2026, 0, 1);

const backdatedCharge = ({
	amount,
	cycleCount,
}: {
	amount: number;
	cycleCount: number;
}): LineItem => {
	const lineItem = lineItemFixtures.charge({ amount });
	return {
		...lineItem,
		context: {
			...lineItem.context,
			backdate: { startsAt, cycleCount },
			price: {
				...lineItem.context.price,
				config: {
					...(lineItem.context.price.config ?? {}),
					interval: BillingInterval.Month,
					interval_count: 1,
				},
			},
		},
	};
};

const withDuration = ({
	discount,
	duration,
	durationInMonths,
}: {
	discount: StripeDiscountWithCoupon;
	duration: "forever" | "once" | "repeating";
	durationInMonths?: number;
}): StripeDiscountWithCoupon => ({
	...discount,
	source: {
		...discount.source,
		coupon: {
			...discount.source.coupon,
			duration,
			duration_in_months: durationInMonths ?? null,
		},
	},
});

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
			expect(result[0].amountAfterDiscounts).toBe(100);
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

			expect(result[0].amountAfterDiscounts).toBe(75);
			expect(result[0].discounts).toHaveLength(1);
			expect(result[0].discounts[0].amountOff).toBe(25);
			expect(result[0].discounts[0].percentOff).toBe(25);
		});

		test("fresh one-time percent_off discount disables Stripe discounting when requested", () => {
			const lineItem = lineItemFixtures.charge({ amount: 100 });
			const lineItems = [
				{
					...lineItem,
					context: {
						...lineItem.context,
						discountable: true,
					},
				},
			];
			const discountList = [
				withDuration({
					discount: discounts.percentOff({ percentOff: 25 }),
					duration: "once",
				}),
			];

			const result = applyStripeDiscountsToLineItems({
				lineItems,
				discounts: discountList,
				options: { disableDiscountableForFreshDiscounts: true },
			});

			expect(result[0].amountAfterDiscounts).toBe(75);
			expect(result[0].context.discountable).toBe(false);
		});

		test("single amount_off discount applied correctly", () => {
			const lineItems = [lineItemFixtures.charge({ amount: 100 })];
			const discountList = [discounts.amountOff({ amountOffCents: 1500 })];

			const result = applyStripeDiscountsToLineItems({
				lineItems,
				discounts: discountList,
			});

			expect(result[0].amountAfterDiscounts).toBe(85);
			expect(result[0].discounts).toHaveLength(1);
			expect(result[0].discounts[0].amountOff).toBe(15);
		});

		test("amount_off discount applies once to a backdated invoice", () => {
			const lineItems = [backdatedCharge({ amount: 40, cycleCount: 2 })];
			const discountList = [
				withDuration({
					discount: discounts.amountOff({ amountOffCents: 500 }),
					duration: "repeating",
					durationInMonths: 12,
				}),
			];

			const result = applyStripeDiscountsToLineItems({
				lineItems,
				discounts: discountList,
			});

			expect(result[0].amountAfterDiscounts).toBe(35);
			expect(result[0].discounts[0].amountOff).toBe(5);
		});

		test("one-month amount_off discount only applies to one backdated cycle", () => {
			const lineItems = [backdatedCharge({ amount: 40, cycleCount: 2 })];
			const discountList = [
				withDuration({
					discount: discounts.amountOff({ amountOffCents: 500 }),
					duration: "repeating",
					durationInMonths: 1,
				}),
			];

			const result = applyStripeDiscountsToLineItems({
				lineItems,
				discounts: discountList,
			});

			expect(result[0].amountAfterDiscounts).toBe(35);
			expect(result[0].discounts[0].amountOff).toBe(5);
		});

		test("duration-limited percent_off only discounts eligible backdated cycles", () => {
			const lineItems = [backdatedCharge({ amount: 40, cycleCount: 2 })];
			const discountList = [
				withDuration({
					discount: discounts.percentOff({ percentOff: 50 }),
					duration: "repeating",
					durationInMonths: 1,
				}),
			];

			const result = applyStripeDiscountsToLineItems({
				lineItems,
				discounts: discountList,
			});

			expect(result[0].amountAfterDiscounts).toBe(30);
			expect(result[0].discounts[0].amountOff).toBe(10);
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

			expect(result[0].discounts).toHaveLength(2);
			expect(result[0].discounts[0].amountOff).toBe(10);
			expect(result[0].discounts[1].amountOff).toBe(18);
			expect(result[0].amountAfterDiscounts).toBe(72);
		});

		test("percent then amount discounts stack correctly", () => {
			const lineItems = [lineItemFixtures.charge({ amount: 100 })];
			const discountList = [
				discounts.twentyPercentOff(),
				discounts.tenDollarsOff(),
			];

			const result = applyStripeDiscountsToLineItems({
				lineItems,
				discounts: discountList,
			});

			expect(result[0].discounts).toHaveLength(2);
			expect(result[0].discounts[0].amountOff).toBe(20);
			expect(result[0].discounts[1].amountOff).toBe(10);
			expect(result[0].amountAfterDiscounts).toBe(70);
		});

		test("percent applied before amount regardless of input order", () => {
			const lineItems = [lineItemFixtures.charge({ amount: 100 })];
			const discountList = [
				discounts.tenDollarsOff(),
				discounts.twentyPercentOff(),
			];

			const result = applyStripeDiscountsToLineItems({
				lineItems,
				discounts: discountList,
			});

			expect(result[0].discounts).toHaveLength(2);
			expect(result[0].discounts[0].amountOff).toBe(20);
			expect(result[0].discounts[0].percentOff).toBe(20);
			expect(result[0].discounts[1].amountOff).toBe(10);
			expect(result[0].amountAfterDiscounts).toBe(70);
		});
	});

	describe(chalk.cyan("Mixed percent_off and amount_off discounts"), () => {
		test("applies both discount types to multiple line items", () => {
			const lineItems = [
				lineItemFixtures.charge({ amount: 80 }),
				lineItemFixtures.charge({ amount: 20 }),
			];
			const discountList = [
				discounts.tenPercentOff(),
				discounts.tenDollarsOff(),
			];

			const result = applyStripeDiscountsToLineItems({
				lineItems,
				discounts: discountList,
			});

			expect(result[0].discounts).toHaveLength(2);
			expect(result[0].discounts[0].amountOff).toBe(8);
			expect(result[0].discounts[1].amountOff).toBe(8);
			expect(result[0].amountAfterDiscounts).toBe(64);

			expect(result[1].discounts).toHaveLength(2);
			expect(result[1].discounts[0].amountOff).toBe(2);
			expect(result[1].discounts[1].amountOff).toBe(2);
			expect(result[1].amountAfterDiscounts).toBe(16);
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

			expect(result[0].amountAfterDiscounts).toBe(50);
			expect(result[1].amountAfterDiscounts).toBe(100);
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

			expect(result[0].amountAfterDiscounts).toBe(100);
			expect(result[1].amountAfterDiscounts).toBe(80);
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

			expect(result[0].discounts).toHaveLength(1);
			expect(result[0].amountAfterDiscounts).toBe(80);

			expect(result[1].discounts).toHaveLength(1);
			expect(result[1].amountAfterDiscounts).toBe(90);
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

			expect(result[0].discounts).toHaveLength(0);
			expect(result[0].amountAfterDiscounts).toBe(-100);
		});
	});
});

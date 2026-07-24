import { describe, expect, test } from "bun:test";
import { discounts } from "@tests/utils/fixtures/db/discounts";
import chalk from "chalk";
import {
	stripeDiscountsToCheckoutParams,
	stripeDiscountsToParams,
} from "@/internal/billing/v2/providers/stripe/utils/discounts/stripeDiscountsToParams";

describe(chalk.yellowBright("stripeDiscountsToParams"), () => {
	test("orders percent discounts before fixed discounts to match preview math", () => {
		const amountOff = discounts.fiveDollarsOff();
		const percentOff = discounts.twentyPercentOff();

		const result = stripeDiscountsToParams({
			stripeDiscounts: [amountOff, percentOff],
		});

		expect(result).toEqual([
			{ coupon: percentOff.source.coupon.id },
			{ coupon: amountOff.source.coupon.id },
		]);
	});

	test("uses the same ordering for checkout sessions", () => {
		const amountOff = discounts.fiveDollarsOff();
		const percentOff = discounts.twentyPercentOff();

		const result = stripeDiscountsToCheckoutParams({
			stripeDiscounts: [amountOff, percentOff],
		});

		expect(result).toEqual([
			{ coupon: percentOff.source.coupon.id },
			{ coupon: amountOff.source.coupon.id },
		]);
	});
});

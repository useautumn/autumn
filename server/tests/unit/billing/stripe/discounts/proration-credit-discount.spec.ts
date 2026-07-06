/**
 * Unit tests for discounting proration credits (refund-direction line items).
 *
 * A discount must reduce an outgoing plan's proration credit only when it was
 * active for the period being credited (the customer paid the discounted price
 * for that period). A discount applied mid-cycle, after the period was paid at
 * full price, must leave the credit untouched.
 */

import { describe, expect, test } from "bun:test";
import {
	type LineItem,
	ms,
	msToSeconds,
	type StripeDiscountWithCoupon,
} from "@autumn/shared";
import { lineItems as lineItemFixtures } from "@tests/utils/fixtures/billing/lineItems";
import { discounts } from "@tests/utils/fixtures/db/discounts";
import chalk from "chalk";
import { applyPercentOffDiscountToLineItems } from "@/internal/billing/v2/providers/stripe/utils/discounts/applyPercentOffDiscountToLineItems";
import { discountAppliesToLineItem } from "@/internal/billing/v2/providers/stripe/utils/discounts/discountAppliesToLineItem";

const PERIOD_START_MS = 1_700_000_000_000;
const PERIOD_END_MS = PERIOD_START_MS + ms.days(30);
const ONE_DAY_MS = ms.days(1);

const creditLine = ({ amount = 20 }: { amount?: number } = {}): LineItem => {
	const lineItem = lineItemFixtures.refund({ amount });
	lineItem.context.billingPeriod = {
		start: PERIOD_START_MS,
		end: PERIOD_END_MS,
	};
	return lineItem;
};

const establishedDiscount = ({
	percentOff,
	startMs,
	endMs,
}: {
	percentOff: number;
	startMs: number;
	endMs?: number;
}): StripeDiscountWithCoupon => ({
	...discounts.percentOff({ percentOff }),
	id: "di_existing",
	start: msToSeconds(startMs),
	end: endMs === undefined ? null : msToSeconds(endMs),
});

describe(chalk.yellowBright("proration credit discounting"), () => {
	describe(chalk.cyan("discountAppliesToLineItem (refund)"), () => {
		test("applies when an established discount was active before the credited period", () => {
			const lineItem = creditLine();
			const discount = establishedDiscount({
				percentOff: 20,
				startMs: PERIOD_START_MS - ONE_DAY_MS,
			});

			expect(discountAppliesToLineItem({ discount, lineItem })).toBe(true);
		});

		test("does not apply when the discount started at the credited period start (applied mid-cycle, after the period was paid at full price)", () => {
			const lineItem = creditLine();
			const discount = establishedDiscount({
				percentOff: 20,
				startMs: PERIOD_START_MS,
			});

			expect(discountAppliesToLineItem({ discount, lineItem })).toBe(false);
		});

		test("does not apply when the discount started after the credited period start", () => {
			const lineItem = creditLine();
			const discount = establishedDiscount({
				percentOff: 20,
				startMs: PERIOD_START_MS + ONE_DAY_MS,
			});

			expect(discountAppliesToLineItem({ discount, lineItem })).toBe(false);
		});

		test("does not apply for a freshly-resolved param discount (no Stripe id)", () => {
			const lineItem = creditLine();
			const discount = discounts.twentyPercentOff();

			expect(discountAppliesToLineItem({ discount, lineItem })).toBe(false);
		});

		test("does not apply when the discount ended before the credited period", () => {
			const lineItem = creditLine();
			const discount = establishedDiscount({
				percentOff: 20,
				startMs: PERIOD_START_MS - 10 * ONE_DAY_MS,
				endMs: PERIOD_START_MS - ONE_DAY_MS,
			});

			expect(discountAppliesToLineItem({ discount, lineItem })).toBe(false);
		});
	});

	describe(chalk.cyan("applyPercentOffDiscountToLineItems (refund)"), () => {
		test("shrinks the credit toward zero by the discount, never flipping sign", () => {
			const lineItem = creditLine({ amount: 20 });
			const discount = establishedDiscount({
				percentOff: 20,
				startMs: PERIOD_START_MS - ONE_DAY_MS,
			});

			const [result] = applyPercentOffDiscountToLineItems({
				lineItems: [lineItem],
				discount,
			});

			expect(result.amountAfterDiscounts).toBe(-16);
			expect(result.discounts).toHaveLength(1);
			expect(result.discounts[0].amountOff).toBe(4);
			expect(result.discounts[0].percentOff).toBe(20);
		});

		test("leaves the credit at full price when the discount started at/after the credited period start", () => {
			const lineItem = creditLine({ amount: 20 });
			const discount = establishedDiscount({
				percentOff: 20,
				startMs: PERIOD_START_MS,
			});

			const [result] = applyPercentOffDiscountToLineItems({
				lineItems: [lineItem],
				discount,
			});

			expect(result.amountAfterDiscounts).toBe(-20);
			expect(result.discounts).toHaveLength(0);
		});
	});
});

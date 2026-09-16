import { expect, test } from "bun:test";
import { type LineItem, stripeToAtmnAmount } from "@autumn/shared";
import { allocateAmountOffDiscounts } from "@/internal/billing/v2/providers/stripe/utils/discounts/applyAmountOffDiscountToLineItems";

const lineItem = (amount: number): LineItem =>
	({ amount }) as unknown as LineItem;

// Weights are proportional to |amount|, so the 100-unit item has remainder 0.67
// and the 50-unit item 0.33 for an off of 10 (6.67 -> 6 and 3.33 -> 3, one unit
// left over). The leftover unit must go to the higher-remainder item (the 100
// one). A zero-amount item is filtered out before allocation, which used to make
// the leftover loop index the filtered array with the original line-item index.
test("allocateAmountOffDiscounts gives the rounding remainder to the correct item when a zero-amount item is present", () => {
	const zero = lineItem(0);
	const big = lineItem(100);
	const small = lineItem(50);

	const result = allocateAmountOffDiscounts({
		lineItems: [zero, big, small],
		amountOffMinorUnits: 10,
		currency: "usd",
	});

	expect(result.get(big)).toBe(stripeToAtmnAmount({ amount: 7, currency: "usd" }));
	expect(result.get(small)).toBe(stripeToAtmnAmount({ amount: 3, currency: "usd" }));
	expect(result.get(zero)).toBeUndefined();
});

test("allocateAmountOffDiscounts does not crash when the highest-remainder item follows a filtered zero-amount item", () => {
	const zero = lineItem(0);
	const a = lineItem(100);
	const b = lineItem(200);

	expect(() =>
		allocateAmountOffDiscounts({
			lineItems: [zero, a, b],
			amountOffMinorUnits: 1,
			currency: "usd",
		}),
	).not.toThrow();
});

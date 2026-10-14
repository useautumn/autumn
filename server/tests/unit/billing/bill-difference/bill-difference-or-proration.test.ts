/**
 * `bill_difference` bills each change (one plan slot) the larger of its full-period
 * difference and its normal proration, compared after coupons.
 */

import { describe, expect, test } from "bun:test";
import {
	type BillingContext,
	type LineItem,
	ms,
	type StripeDiscountWithCoupon,
} from "@autumn/shared";
import { lineItems as lineItemFixtures } from "@tests/utils/fixtures/billing/lineItems";
import chalk from "chalk";
import type Stripe from "stripe";
import { billDifferenceOrProration } from "@/internal/billing/v2/compute/finalize/billDifferenceOrProration";

const PERIOD_START_MS = 1_700_000_000_000;
const PERIOD_END_MS = PERIOD_START_MS + ms.days(30);
const HALFWAY_MS = PERIOD_START_MS + ms.days(15);

const billingContext = {
	requestedProrationBehavior: "bill_difference",
	stripeSubscription: {},
	currentEpochMs: HALFWAY_MS,
} as unknown as BillingContext;

const setPlansBillingContext = {
	...billingContext,
	immediatePhase: {},
	scheduledPhaseContexts: [],
} as unknown as BillingContext;

const halfOffCoupon: StripeDiscountWithCoupon = {
	id: "di_half_off",
	start: (PERIOD_START_MS - ms.days(60)) / 1000,
	source: {
		coupon: { id: "half_off", percent_off: 50 } as Stripe.Coupon,
	},
};

const fiftyOffCoupon: StripeDiscountWithCoupon = {
	id: "di_fifty_off",
	start: (PERIOD_START_MS - ms.days(60)) / 1000,
	source: {
		coupon: {
			id: "fifty_off",
			amount_off: 5000,
			currency: "usd",
		} as Stripe.Coupon,
	},
};

const line = ({
	direction,
	amount,
	quantity = 1,
	priceId = "price_base",
	customerProductId = "cus_prod_pro",
	productId = "pro",
	group = "main",
	isAddOn = false,
	billingTiming = "in_advance",
	amountAfterDiscountsFinalized,
}: {
	direction: "charge" | "refund";
	amount: number;
	quantity?: number;
	priceId?: string;
	customerProductId?: string;
	productId?: string;
	group?: string;
	isAddOn?: boolean;
	billingTiming?: "in_advance" | "in_arrear";
	amountAfterDiscountsFinalized?: boolean;
}): LineItem => {
	const lineItem =
		direction === "charge"
			? lineItemFixtures.charge({ amount })
			: lineItemFixtures.refund({ amount });
	lineItem.paidQuantity = quantity;
	lineItem.amountAfterDiscountsFinalized = amountAfterDiscountsFinalized;
	lineItem.context.price = { id: priceId } as LineItem["context"]["price"];
	lineItem.context.billingTiming = billingTiming;
	lineItem.context.customerProduct = {
		id: customerProductId,
		internal_entity_id: null,
		product: { id: productId, group, is_add_on: isAddOn },
	} as unknown as LineItem["context"]["customerProduct"];
	lineItem.context.billingPeriod = {
		start: PERIOD_START_MS,
		end: PERIOD_END_MS,
	};
	return lineItem;
};

const planSwitch = ({ from, to }: { from: number; to: number }) => [
	line({ direction: "refund", amount: from, priceId: "old" }),
	line({
		direction: "charge",
		amount: to,
		priceId: "new",
		customerProductId: "cus_prod_new",
		productId: "new",
	}),
];

const amounts = (lineItems: LineItem[]) => lineItems.map((li) => li.amount);

describe(chalk.yellowBright("billDifferenceOrProration"), () => {
	test("an upgrade bills the full difference", () => {
		const result = billDifferenceOrProration({
			billingContext,
			lineItems: planSwitch({ from: 20, to: 50 }),
		});

		expect(amounts(result)).toEqual([-20, 50]);
	});

	test("a downgrade bills normal proration", () => {
		const result = billDifferenceOrProration({
			billingContext,
			lineItems: planSwitch({ from: 50, to: 20 }),
		});

		expect(amounts(result)).toEqual([-25, 10]);
	});

	test("a quantity increase keeps the full-period difference", () => {
		const result = billDifferenceOrProration({
			billingContext,
			lineItems: [
				line({ direction: "refund", amount: 30, quantity: 300 }),
				line({ direction: "charge", amount: 50, quantity: 500 }),
			],
		});

		expect(amounts(result)).toEqual([-30, 50]);
	});

	test("a quantity decrease is prorated", () => {
		const result = billDifferenceOrProration({
			billingContext,
			lineItems: [
				line({ direction: "refund", amount: 50, quantity: 500 }),
				line({ direction: "charge", amount: 40, quantity: 400 }),
			],
		});

		expect(amounts(result)).toEqual([-25, 20]);
	});

	test("coupons count: a discounted charge below the paid credit is prorated", () => {
		const result = billDifferenceOrProration({
			billingContext: { ...billingContext, stripeDiscounts: [halfOffCoupon] },
			lineItems: [
				line({
					direction: "refund",
					amount: 25,
					quantity: 500,
					amountAfterDiscountsFinalized: true,
				}),
				line({ direction: "charge", amount: 40, quantity: 400 }),
			],
		});

		expect(amounts(result)).toEqual([-12.5, 20]);
	});

	test("without a coupon the same lines bill the full difference", () => {
		const result = billDifferenceOrProration({
			billingContext,
			lineItems: [
				line({ direction: "refund", amount: 25, quantity: 500 }),
				line({ direction: "charge", amount: 40, quantity: 400 }),
			],
		});

		expect(amounts(result)).toEqual([-25, 40]);
	});

	test("a fixed-amount coupon doesn't change which side each slot bills", () => {
		const addOnSwap = planSwitch({ from: 100, to: 100 }).map((lineItem) => {
			const product = lineItem.context.customerProduct?.product;
			if (product) Object.assign(product, { id: "add_on", is_add_on: true });
			lineItem.context.billingPeriod = {
				start: HALFWAY_MS - ms.days(3),
				end: HALFWAY_MS + ms.days(27),
			};
			return lineItem;
		});
		const result = billDifferenceOrProration({
			billingContext: { ...billingContext, stripeDiscounts: [fiftyOffCoupon] },
			lineItems: [...planSwitch({ from: 100, to: 100 }), ...addOnSwap],
		});

		expect(amounts(result)).toEqual([-100, 100, -100, 100]);
	});

	test("a removal with nothing replacing it is prorated", () => {
		const result = billDifferenceOrProration({
			billingContext,
			lineItems: [line({ direction: "refund", amount: 20 })],
		});

		expect(amounts(result)).toEqual([-10]);
	});

	test("a set_plans re-list that raises the quantity bills the full difference", () => {
		const result = billDifferenceOrProration({
			billingContext: setPlansBillingContext,
			lineItems: [
				line({ direction: "refund", amount: 10, quantity: 100 }),
				line({
					direction: "charge",
					amount: 20,
					quantity: 200,
					customerProductId: "cus_prod_pro_relisted",
				}),
			],
		});

		expect(amounts(result)).toEqual([-10, 20]);
	});

	test("each plan slot is its own change", () => {
		const addOnRemoval = line({
			direction: "refund",
			amount: 20,
			priceId: "add_on",
			customerProductId: "cus_prod_add_on",
			productId: "add_on",
			isAddOn: true,
		});
		const result = billDifferenceOrProration({
			billingContext,
			lineItems: [...planSwitch({ from: 20, to: 50 }), addOnRemoval],
		});

		expect(amounts(result)).toEqual([-20, 50, -10]);
	});

	test("past usage is billed as is when its plan's change is prorated", () => {
		const usage = line({
			direction: "charge",
			amount: 7,
			priceId: "usage",
			billingTiming: "in_arrear",
		});
		const result = billDifferenceOrProration({
			billingContext,
			lineItems: [...planSwitch({ from: 50, to: 20 }), usage],
		});

		expect(amounts(result)).toEqual([-25, 10, 7]);
	});

	test("leaves line items alone without bill_difference", () => {
		const lineItems = planSwitch({ from: 50, to: 20 });
		const result = billDifferenceOrProration({
			billingContext: {
				...billingContext,
				requestedProrationBehavior: undefined,
			} as BillingContext,
			lineItems,
		});

		expect(result).toBe(lineItems);
	});
});

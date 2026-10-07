/**
 * `bill_difference` decides per price whether something was removed from the quantity,
 * not from the net amount, so a discounted stored credit cannot flip a removal into an addition.
 */

import { describe, expect, test } from "bun:test";
import { type BillingContext, type LineItem, ms } from "@autumn/shared";
import { lineItems as lineItemFixtures } from "@tests/utils/fixtures/billing/lineItems";
import chalk from "chalk";
import { prorateBillDifferenceCredits } from "@/internal/billing/v2/compute/finalize/prorateBillDifferenceCredits";

const PERIOD_START_MS = 1_700_000_000_000;
const PERIOD_END_MS = PERIOD_START_MS + ms.days(30);
const HALFWAY_MS = PERIOD_START_MS + ms.days(15);

const billingContext = {
	requestedProrationBehavior: "bill_difference",
	stripeSubscription: {},
	currentEpochMs: HALFWAY_MS,
} as unknown as BillingContext;

/** Only set_plans re-lists move a quantity onto a new customer product. */
const setPlansBillingContext = {
	...billingContext,
	immediatePhase: {},
	scheduledPhaseContexts: [],
} as unknown as BillingContext;

const line = ({
	direction,
	amount,
	quantity,
	priceId = "price_packs",
	customerProductId = "cus_prod_pro",
}: {
	direction: "charge" | "refund";
	amount: number;
	quantity: number;
	priceId?: string;
	customerProductId?: string;
}): LineItem => {
	const lineItem =
		direction === "charge"
			? lineItemFixtures.charge({ amount })
			: lineItemFixtures.refund({ amount });
	lineItem.paidQuantity = quantity;
	lineItem.context.price = { id: priceId } as LineItem["context"]["price"];
	lineItem.context.customerProduct = {
		id: customerProductId,
	} as LineItem["context"]["customerProduct"];
	lineItem.context.billingPeriod = {
		start: PERIOD_START_MS,
		end: PERIOD_END_MS,
	};
	return lineItem;
};

const amounts = (lineItems: LineItem[]) => lineItems.map((li) => li.amount);

describe(chalk.yellowBright("prorateBillDifferenceCredits"), () => {
	test("a discounted credit that nets positive is still prorated when quantity drops", () => {
		const result = prorateBillDifferenceCredits({
			billingContext,
			lineItems: [
				line({ direction: "refund", amount: 25, quantity: 500 }),
				line({ direction: "charge", amount: 40, quantity: 400 }),
			],
		});

		expect(amounts(result)).toEqual([-12.5, 20]);
	});

	test("an increase keeps the full-period difference", () => {
		const result = prorateBillDifferenceCredits({
			billingContext,
			lineItems: [
				line({ direction: "refund", amount: 30, quantity: 300 }),
				line({ direction: "charge", amount: 50, quantity: 500 }),
			],
		});

		expect(amounts(result)).toEqual([-30, 50]);
	});

	test("a set_plans quantity moved to a new customer product credits the old quantity's unused time", () => {
		const result = prorateBillDifferenceCredits({
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

		expect(amounts(result)).toEqual([-5, 20]);
	});

	test("an unchanged quantity on a new customer product is left alone", () => {
		const result = prorateBillDifferenceCredits({
			billingContext,
			lineItems: [
				line({ direction: "refund", amount: 5, quantity: 100 }),
				line({
					direction: "charge",
					amount: 10,
					quantity: 100,
					customerProductId: "cus_prod_pro_relisted",
				}),
			],
		});

		expect(amounts(result)).toEqual([-5, 10]);
	});

	test("an outgoing price with no matching charge is prorated", () => {
		const result = prorateBillDifferenceCredits({
			billingContext,
			lineItems: [
				line({ direction: "refund", amount: 20, quantity: 1, priceId: "pro" }),
				line({
					direction: "charge",
					amount: 50,
					quantity: 1,
					priceId: "premium",
				}),
			],
		});

		expect(amounts(result)).toEqual([-10, 50]);
	});

	test("leaves line items alone without bill_difference", () => {
		const lineItems = [
			line({ direction: "refund", amount: 25, quantity: 500 }),
			line({ direction: "charge", amount: 40, quantity: 400 }),
		];
		const result = prorateBillDifferenceCredits({
			billingContext: {
				...billingContext,
				requestedProrationBehavior: undefined,
			} as BillingContext,
			lineItems,
		});

		expect(result).toBe(lineItems);
	});
});

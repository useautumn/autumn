import { describe, expect, test } from "bun:test";
import {
	type AutumnBillingPlan,
	BillingInterval,
	type BillingPlan,
	CusProductStatus,
	type FullCusProduct,
	type Price,
} from "@autumn/shared";
import { contexts } from "@tests/utils/fixtures/db/contexts";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts";
import { prices } from "@tests/utils/fixtures/db/prices";
import { products } from "@tests/utils/fixtures/db/products";
import { stripeSubscriptions } from "@tests/utils/fixtures/stripe/subscriptions";
import { previewNextCycle } from "./utils/requestPhaseProrations";

// 31-day cycle; the switch leaves 11/31 of it, so each prorated line has sub-cent remainders.
const anchorMs = Date.UTC(2026, 0, 1);
const currentEpochMs = Date.UTC(2026, 0, 11);
const switchMs = Date.UTC(2026, 0, 21);

const plan = ({
	id,
	amount,
	startsAt = anchorMs,
	endedAt,
	status = CusProductStatus.Active,
}: {
	id: string;
	amount: number;
	startsAt?: number;
	endedAt?: number;
	status?: CusProductStatus;
}): FullCusProduct => {
	const fixedPrice = prices.createFixed({ id: `price_${id}` });
	const price = {
		...fixedPrice,
		config: { ...fixedPrice.config, amount, interval: BillingInterval.Month },
	} as Price;
	const product = products.createFull({ id, prices: [price] });

	return customerProducts.create({
		id,
		productId: id,
		status,
		startsAt,
		endedAt,
		subscriptionIds: ["sub_test"],
		customerPrices: [prices.createCustomer({ price, customerProductId: id })],
		product: { ...product, group: "main" },
	});
};

const previewMidCycleSwitch = ({
	currentAmount,
	nextAmount,
	currency,
}: {
	currentAmount: number;
	nextAmount: number;
	currency: string;
}) =>
	previewNextCycle({
		ctx: contexts.create({
			org: { ...contexts.createOrg(), default_currency: currency },
		}),
		billingContext: contexts.createBilling({
			customerProducts: [
				plan({ id: "pro", amount: currentAmount, endedAt: switchMs }),
				plan({
					id: "premium",
					amount: nextAmount,
					startsAt: switchMs,
					status: CusProductStatus.Scheduled,
				}),
			],
			currentEpochMs,
			billingCycleAnchorMs: anchorMs,
		}),
		billingPlan: {
			autumn: {
				insertCustomerProducts: [],
				lineItems: [],
			} as unknown as AutumnBillingPlan,
		} as BillingPlan,
	}).nextCycle;

describe("next cycle preview rounding", () => {
	test("USD: a mid-cycle switch rounds each prorated line to cents before summing", () => {
		// Lines are 50·11/31 = 17.7419… and −20·11/31 = −7.0967…; Stripe bills 17.74 − 7.10.
		const nextCycle = previewMidCycleSwitch({
			currentAmount: 20,
			nextAmount: 50,
			currency: "usd",
		});

		expect(nextCycle?.starts_at).toBe(switchMs);
		expect(nextCycle?.line_items.map((lineItem) => lineItem.total)).toEqual([
			17.74, -7.1,
		]);
		expect(nextCycle?.subtotal).toBe(10.64);
		expect(nextCycle?.total).toBe(10.64);
	});

	test("JPY: a mid-cycle switch rounds each prorated line to whole yen before summing", () => {
		// 5000·11/31 = 1774.19… and −2000·11/31 = −709.67…; Stripe bills 1774 − 710.
		const nextCycle = previewMidCycleSwitch({
			currentAmount: 2000,
			nextAmount: 5000,
			currency: "jpy",
		});

		expect(nextCycle?.line_items.map((lineItem) => lineItem.total)).toEqual([
			1774, -710,
		]);
		expect(nextCycle?.subtotal).toBe(1064);
		expect(nextCycle?.total).toBe(1064);
	});
});

describe("next cycle preview rounding for a scheduled anchor mid-period", () => {
	test("JPY: rounds each scaled line to whole yen once, not to 2dp first", () => {
		// Anchor Jan 13 01:00 bills 1497 x 289/744 = 581.4959…: ¥581, where 2dp first gives 581.50 -> ¥582.
		const scheduledAnchorMs = Date.UTC(2026, 0, 13, 1);
		const nextCycle = previewNextCycle({
			ctx: contexts.create({
				org: { ...contexts.createOrg(), default_currency: "jpy" },
			}),
			billingContext: {
				...contexts.createBilling({
					customerProducts: [plan({ id: "pro", amount: 1497 })],
					currentEpochMs,
					billingCycleAnchorMs: anchorMs,
					stripeSubscription: {
						...stripeSubscriptions.create({ id: "sub_test" }),
						billing_cycle_anchor: anchorMs / 1000,
					},
				}),
				requestedBillingCycleAnchor: scheduledAnchorMs,
			},
			billingPlan: {
				autumn: {
					insertCustomerProducts: [],
					lineItems: [],
				} as unknown as AutumnBillingPlan,
			} as BillingPlan,
		}).nextCycle;

		expect(nextCycle?.starts_at).toBe(scheduledAnchorMs);
		expect(nextCycle?.line_items.map((lineItem) => lineItem.total)).toEqual([
			581,
		]);
		expect(nextCycle?.total).toBe(581);
	});
});

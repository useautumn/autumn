import { describe, expect, test } from "bun:test";
import {
	type AutumnBillingPlan,
	type BillingContext,
	BillingInterval,
	type BillingPlan,
	type FullCusProduct,
	type Price,
} from "@autumn/shared";
import { contexts } from "@tests/utils/fixtures/db/contexts";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts";
import { prices } from "@tests/utils/fixtures/db/prices";
import { products } from "@tests/utils/fixtures/db/products";
import { stripeSubscriptions } from "@tests/utils/fixtures/stripe/subscriptions";
import { billingPlanToNextCyclePreview } from "@/internal/billing/v2/utils/billingPlan/toNextCyclePreview/billingPlanToNextCyclePreview";

// Monthly period Jan 1–Feb 1 and annual Jan 1 2026–2027; the anchor restarts both on Jan 21.
const originalAnchorMs = Date.UTC(2026, 0, 1);
const currentEpochMs = Date.UTC(2026, 0, 11);
const scheduledAnchorMs = Date.UTC(2026, 0, 21);

const plan = ({
	id,
	amount,
	interval,
	group,
}: {
	id: string;
	amount: number;
	interval: BillingInterval;
	group: string;
}): FullCusProduct => {
	const fixedPrice = prices.createFixed({ id: `price_${id}` });
	const price = {
		...fixedPrice,
		config: { ...fixedPrice.config, amount, interval },
	} as Price;
	const product = products.createFull({ id, prices: [price] });

	return customerProducts.create({
		id,
		productId: id,
		startsAt: originalAnchorMs,
		subscriptionIds: ["sub_test"],
		customerPrices: [prices.createCustomer({ price, customerProductId: id })],
		product: { ...product, group },
	});
};

const monthlyProAndAnnualAddOn = [
	plan({
		id: "pro",
		amount: 20,
		interval: BillingInterval.Month,
		group: "main",
	}),
	plan({
		id: "annual-addon",
		amount: 240,
		interval: BillingInterval.Year,
		group: "addons",
	}),
];

const previewAnchorReset = ({
	requestedProrationBehavior,
}: {
	requestedProrationBehavior?: BillingContext["requestedProrationBehavior"];
}) =>
	billingPlanToNextCyclePreview({
		ctx: contexts.create({}),
		billingContext: {
			...contexts.createBilling({
				customerProducts: monthlyProAndAnnualAddOn,
				currentEpochMs,
				billingCycleAnchorMs: originalAnchorMs,
				stripeSubscription: {
					...stripeSubscriptions.create({ id: "sub_test" }),
					billing_cycle_anchor: originalAnchorMs / 1000,
				},
			}),
			requestedBillingCycleAnchor: scheduledAnchorMs,
			requestedProrationBehavior,
			// A set_plans context, so the anchor's reset phase carries phase 0's proration.
			immediatePhase: {},
			scheduledPhaseContexts: [],
		} as BillingContext,
		billingPlan: {
			autumn: {
				insertCustomerProducts: [],
				lineItems: [],
			} as unknown as AutumnBillingPlan,
		} as BillingPlan,
	}).nextCycle;

describe("next cycle preview for a scheduled anchor mid-period on a mixed-interval subscription", () => {
	test("prorates each line over its own interval's extra window", () => {
		// Monthly: 20 x 20/31 = 12.90. Annual: 240 x 20/365 = 13.15, not 240 x 20/31.
		const nextCycle = previewAnchorReset({});

		expect(nextCycle?.starts_at).toBe(scheduledAnchorMs);
		expect(
			nextCycle?.line_items.map((lineItem) => lineItem.total.toFixed(2)),
		).toEqual(["12.90", "13.15"]);
		expect(nextCycle?.total).toBe(26.05);
	});

	test("with none, nothing is charged at the anchor and the next invoice renews only the monthly plan", () => {
		const nextCycle = previewAnchorReset({
			requestedProrationBehavior: "none",
		});

		expect(nextCycle?.starts_at).toBe(Date.UTC(2026, 1, 21));
		expect(nextCycle?.line_items.map((lineItem) => lineItem.plan_id)).toEqual([
			"pro",
		]);
		expect(nextCycle?.total).toBe(20);
	});
});

import { expect, test } from "bun:test";
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
import { billingPlanToNextCyclePreview } from "@/internal/billing/v2/utils/billingPlan/toNextCyclePreview/billingPlanToNextCyclePreview";
import { requestPhaseProrations } from "./utils/requestPhaseProrations";

const previewNextCycle = (
	params: Omit<
		Parameters<typeof billingPlanToNextCyclePreview>[0],
		"phaseProrations"
	>,
) =>
	billingPlanToNextCyclePreview({
		...params,
		phaseProrations: requestPhaseProrations(params.billingContext),
	});

const anchorMs = Date.UTC(2026, 0, 1);
const currentEpochMs = Date.UTC(2026, 0, 11);
const resetAt = Date.UTC(2026, 0, 16);
const switchAt = Date.UTC(2026, 0, 26);

const plan = ({
	id,
	amount,
	startsAt = anchorMs,
	endedAt,
	status = CusProductStatus.Active,
	interval = BillingInterval.Month,
	group,
	subscriptionId = "sub_shared",
	oneOffAmount,
}: {
	id: string;
	amount: number;
	startsAt?: number;
	endedAt?: number;
	status?: CusProductStatus;
	interval?: BillingInterval;
	group?: string;
	subscriptionId?: string;
	oneOffAmount?: number;
}): FullCusProduct => {
	const fixedPrice = prices.createFixed({ id: `price_${id}` });
	const price = {
		...fixedPrice,
		config: { ...fixedPrice.config, amount, interval },
	} as Price;
	const planPrices =
		oneOffAmount === undefined
			? [price]
			: [
					price,
					prices.createOneOff({
						id: `price_${id}_setup`,
						amount: oneOffAmount,
					}),
				];
	const product = products.createFull({ id, prices: planPrices });

	return customerProducts.create({
		id,
		productId: id,
		status,
		startsAt,
		endedAt,
		subscriptionIds: [subscriptionId],
		customerPrices: planPrices.map((planPrice) =>
			prices.createCustomer({ price: planPrice, customerProductId: id }),
		),
		product: group ? { ...product, group } : product,
	});
};

/** A reset under proration none, then a prorated switch, previewed without any stored invoice lines. */
const previewSwitchAfterUninvoicedReset = () =>
	previewNextCycle({
		ctx: contexts.create({}),
		billingContext: Object.assign(
			contexts.createBilling({
				customerProducts: [
					{
						...plan({ id: "pro", amount: 20, endedAt: switchAt }),
						billing_cycle_anchor_resets_at: resetAt,
					},
					plan({
						id: "premium",
						amount: 50,
						startsAt: switchAt,
						status: CusProductStatus.Scheduled,
					}),
				],
				currentEpochMs,
				billingCycleAnchorMs: anchorMs,
			}),
			{
				requestedBillingCycleAnchor: resetAt,
				requestedProrationBehavior: "none" as const,
				immediatePhase: {},
				scheduledPhaseContexts: [
					{
						startsAt: switchAt,
						endsAt: undefined,
						prorationBehavior: "prorate_immediately" as const,
						productContexts: [],
					},
				],
			},
		),
		billingPlan: {
			autumn: {
				insertCustomerProducts: [],
				lineItems: [],
			} as unknown as AutumnBillingPlan,
		} as BillingPlan,
	}).nextCycle;

// Stripe credits only what the old plan last paid for: the reset moved its cycle without billing it.
test("a switch after an uninvoiced reset credits the old plan up to its last paid period end", () => {
	const nextCycle = previewSwitchAfterUninvoicedReset();

	expect(nextCycle?.starts_at).toBe(switchAt);
	const totals = Object.fromEntries(
		(nextCycle?.line_items ?? []).map((lineItem) => [
			lineItem.plan_id,
			lineItem.total,
		]),
	);
	// New plan: 21 of the moved cycle's 31 days. Old plan: the 6 paid days left before 1 Feb.
	expect(totals.premium).toBeCloseTo((50 * 21) / 31, 2);
	expect(totals.pro).toBeCloseTo((-20 * 6) / 31, 2);
});

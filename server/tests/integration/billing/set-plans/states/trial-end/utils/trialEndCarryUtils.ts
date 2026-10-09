import { expect } from "bun:test";
import {
	ms,
	type SetPlansParamsV0Input,
	type SetPlansPreviewResponse,
	stripeRefToId,
} from "@autumn/shared";
import { findStripeSubscriptionByStatus } from "@tests/integration/billing/set-plans/utils/subscriptionStateUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import type Stripe from "stripe";

const PRO_PRICE = 100;
const ANCHOR_DAYS = 8;

export const COUPON_PERCENT_OFF = 50;

type TrialingScenario = {
	ctx: TestContext;
	trialing: Stripe.Subscription;
	stripeCustomerId: string;
};

/** A trialing Pro whose subscription is given settings and discounts, then its trial ended onto a future anchor. */
export const recreateTrialOnAnchor = async ({
	customerId,
	trialDays = 14,
	daysIntoTrial = 0,
	prepare,
	requestParams = () => ({}),
}: {
	customerId: string;
	trialDays?: number;
	daysIntoTrial?: number;
	prepare: (scenario: TrialingScenario) => Promise<unknown>;
	requestParams?: () => Partial<SetPlansParamsV0Input>;
}) => {
	const pro = products.base({
		id: "pro",
		items: [items.monthlyPrice({ price: PRO_PRICE })],
		trialDays,
	});
	const { autumnV2_4, ctx, advancedTo, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});
	const trialing = await findStripeSubscriptionByStatus({
		ctx,
		customerId,
		status: "trialing",
	});
	const stripeCustomerId = stripeRefToId(trialing.customer);
	await prepare({ ctx, trialing, stripeCustomerId });

	const nowMs = advancedTo + ms.days(daysIntoTrial);
	if (daysIntoTrial > 0) {
		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			advanceTo: nowMs,
			waitForSeconds: 10,
		});
	}

	const before = await ctx.stripeCli.subscriptions.retrieve(trialing.id, {
		expand: ["discounts.source.coupon"],
	});
	const params: SetPlansParamsV0Input = {
		customer_id: customerId,
		free_trial: null,
		...requestParams(),
		phases: [
			{
				starts_at: "now",
				billing_cycle_anchor: nowMs + ms.days(ANCHOR_DAYS),
				proration_behavior: "prorate_immediately",
				plans: [{ plan_id: pro.id }],
			},
		],
	};
	const preview = await autumnV2_4.billing.previewSetPlans(params);
	await autumnV2_4.billing.setPlans(params);

	const after = await findStripeSubscriptionByStatus({
		ctx,
		customerId,
		status: "active",
	});
	const recreated = await ctx.stripeCli.subscriptions.retrieve(after.id, {
		expand: ["discounts.source.coupon", "default_tax_rates"],
	});
	expect(recreated.id).not.toBe(trialing.id);
	expect((await ctx.stripeCli.subscriptions.retrieve(trialing.id)).status).toBe(
		"canceled",
	);

	const firstInvoice = await ctx.stripeCli.invoices.retrieve(
		stripeRefToId(recreated.latest_invoice)!,
		{ expand: ["discounts.source.coupon"] },
	);
	return { ctx, before, recreated, preview, firstInvoice };
};

/** The preview bills exactly what Stripe invoiced when the new subscription was created. */
export const expectPreviewMatchesInvoice = ({
	preview,
	firstInvoice,
}: {
	preview: SetPlansPreviewResponse;
	firstInvoice: Stripe.Invoice;
}) => {
	expect(firstInvoice.total).toBeGreaterThan(0);
	expect(preview.total).toBe(firstInvoice.total / 100);
};

type DiscountRef = string | Stripe.Discount | Stripe.DeletedDiscount;

export const discountCouponIds = (
	discounts: DiscountRef[] | null | undefined,
) =>
	(discounts ?? []).map((discount) =>
		typeof discount === "string"
			? discount
			: stripeRefToId(discount.source?.coupon),
	);

export const discountPromotionCodeIds = (
	discounts: DiscountRef[] | null | undefined,
) =>
	(discounts ?? []).map((discount) =>
		typeof discount === "string"
			? undefined
			: stripeRefToId(discount.promotion_code),
	);

/** Stripe folds a new subscription's discount into its prorated line, so the invoice only references it. */
export const expectInvoiceDiscounted = (invoice: Stripe.Invoice) => {
	expect(invoice.total_discount_amounts?.length ?? 0).toBeGreaterThan(0);
};

export const applyDiscount = async ({
	ctx,
	trialing,
	discount,
}: TrialingScenario & {
	discount: Stripe.SubscriptionUpdateParams.Discount;
}) =>
	ctx.stripeCli.subscriptions.update(trialing.id, { discounts: [discount] });

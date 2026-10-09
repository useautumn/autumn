import { msToSeconds, stripeRefToId } from "@autumn/shared";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import { Decimal } from "decimal.js";
import type Stripe from "stripe";
import { findStripeSubscriptionByStatus } from "../../set-plans/utils/subscriptionStateUtils";

/** One unit moved on the shared subscription by the reset, in major units. */
export type StripeResetNowChange = {
	removeUnitAmount?: number;
	addUnitAmount?: number;
};

const waitForTestClock = async ({
	ctx,
	testClockId,
}: {
	ctx: TestContext;
	testClockId: string;
}) => {
	for (;;) {
		const clock =
			await ctx.stripeCli.testHelpers.testClocks.retrieve(testClockId);
		if (clock.status === "ready") return;
		await new Promise((resolve) => setTimeout(resolve, 2000));
	}
};

const toPriceData = ({
	price,
	unitAmount = price.unit_amount ?? 0,
}: {
	price: Stripe.Price;
	unitAmount?: number;
}) => ({
	currency: price.currency,
	product: stripeRefToId(price.product),
	unit_amount: unitAmount,
	recurring: {
		interval: price.recurring!.interval,
		interval_count: price.recurring!.interval_count,
	},
});

/** The twin's items with the changes applied: one unit off a matching item, one new item per added unit. */
const applyChangesToTwinItems = ({
	twinSubscription,
	changes,
}: {
	twinSubscription: Stripe.Subscription;
	changes: StripeResetNowChange[];
}): Stripe.InvoiceCreatePreviewParams.SubscriptionDetails.Item[] => {
	const quantityByItemId = new Map(
		twinSubscription.items.data.map((item) => [item.id, item.quantity ?? 0]),
	);
	const [firstItem] = twinSubscription.items.data;
	const added: Stripe.InvoiceCreatePreviewParams.SubscriptionDetails.Item[] =
		[];
	for (const { removeUnitAmount, addUnitAmount } of changes) {
		if (removeUnitAmount !== undefined) {
			const item = twinSubscription.items.data.find(
				({ id, price }) =>
					price.unit_amount === removeUnitAmount * 100 &&
					(quantityByItemId.get(id) ?? 0) > 0,
			);
			if (!item) throw new Error(`No twin item at ${removeUnitAmount}`);
			quantityByItemId.set(item.id, quantityByItemId.get(item.id)! - 1);
		}
		if (addUnitAmount !== undefined) {
			added.push({
				price_data: toPriceData({
					price: firstItem!.price,
					unitAmount: addUnitAmount * 100,
				}),
				quantity: 1,
			});
		}
	}
	return [
		...Array.from(quantityByItemId, ([id, quantity]) =>
			quantity > 0 ? { id, quantity } : { id, deleted: true },
		),
		...added,
	];
};

/**
 * What Stripe invoices at a reset-now on a Stripe-native twin of the customer's live
 * subscription. A preview on Autumn's subscription is skewed: in flexible mode Stripe only credits what it billed itself.
 */
export const previewStripeTwinResetNowTotal = async ({
	ctx,
	customerId,
	advancedTo,
	changes = [],
	prorationBehavior = "always_invoice",
}: {
	ctx: TestContext;
	customerId: string;
	advancedTo: number;
	changes?: StripeResetNowChange[];
	prorationBehavior?: "always_invoice" | "none";
}) => {
	const subscription = await findStripeSubscriptionByStatus({
		ctx,
		customerId,
		status: "active",
	});
	const licensedItems = subscription.items.data.filter(
		({ price }) => price.recurring?.usage_type === "licensed",
	);
	const periodStart = Math.min(
		...licensedItems.map(({ current_period_start }) => current_period_start),
	);

	const testClock = await ctx.stripeCli.testHelpers.testClocks.create({
		frozen_time: periodStart,
	});
	try {
		const twinCustomer = await ctx.stripeCli.customers.create({
			test_clock: testClock.id,
			payment_method: "pm_card_visa",
			invoice_settings: { default_payment_method: "pm_card_visa" },
		});
		const twinSubscription = await ctx.stripeCli.subscriptions.create({
			customer: twinCustomer.id,
			billing_mode: { type: "flexible" },
			items: licensedItems.map(({ price, quantity }) => ({
				price_data: toPriceData({ price }),
				quantity,
			})),
		});
		await ctx.stripeCli.testHelpers.testClocks.advance(testClock.id, {
			frozen_time: msToSeconds(advancedTo),
		});
		await waitForTestClock({ ctx, testClockId: testClock.id });

		const preview = await ctx.stripeCli.invoices.createPreview({
			customer: twinCustomer.id,
			subscription: twinSubscription.id,
			subscription_details: {
				billing_cycle_anchor: "now",
				proration_behavior: prorationBehavior,
				items: applyChangesToTwinItems({ twinSubscription, changes }),
			},
		});
		// Without an immediate invoice the preview is the next renewal, so nothing is billed at the reset.
		const invoicedAtReset = preview.period_end <= msToSeconds(advancedTo);
		return invoicedAtReset ? new Decimal(preview.total).div(100).toNumber() : 0;
	} finally {
		await ctx.stripeCli.testHelpers.testClocks.del(testClock.id);
	}
};

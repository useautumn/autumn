import {
	applyProration,
	type BillingInterval,
	getCycleEnd,
	getCycleStart,
	secondsToMs,
} from "@autumn/shared";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { CusService } from "@/internal/customers/CusService.js";

/**
 * Get Stripe subscription for a customer.
 *
 * When `interval` is supplied, the returned billingPeriod is cycle-aligned
 * to the subscription's `billing_cycle_anchor` for that interval (mirrors
 * `getLineItemBillingPeriod` in production). This is the correct period to
 * use when computing proration for a cross-interval add-on (e.g., a monthly
 * item attached to an annual subscription, where Stripe's per-item
 * `current_period_start/end` inherit the parent sub's annual period).
 */
export const getStripeSubscription = async ({
	customerId,
	interval,
	intervalCount = 1,
}: {
	customerId: string;
	interval?: BillingInterval;
	intervalCount?: number;
}) => {
	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });

	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});

	const stripeCustomerId =
		fullCustomer.processor?.id || fullCustomer.processor?.processor_id;

	if (!stripeCustomerId) {
		throw new Error("Missing Stripe customer ID");
	}

	const subscriptions = await stripeCli.subscriptions.list({
		customer: stripeCustomerId,
		status: "all",
	});

	if (subscriptions.data.length === 0) {
		throw new Error("No subscriptions found");
	}

	// Prefer a sub matching the requested interval, falling back to the first active.
	const activeSubs = subscriptions.data.filter(
		(sub) => sub.status === "active" || sub.status === "trialing",
	);
	const candidateSubs = activeSubs.length > 0 ? activeSubs : subscriptions.data;

	const subscription =
		(interval &&
			candidateSubs.find((sub) =>
				sub.items.data.some(
					(item) => item.price?.recurring?.interval === interval,
				),
			)) ||
		candidateSubs[0];

	// Get billing period from the first subscription item
	// Stripe stores current_period_start/end on each item, not the subscription itself
	const firstItem = subscription.items.data[0];
	if (!firstItem) {
		throw new Error("No subscription items found");
	}

	const itemData = firstItem as unknown as {
		current_period_start: number;
		current_period_end: number;
	};

	const periodStart = itemData.current_period_start;
	const periodEnd = itemData.current_period_end;

	if (typeof periodStart !== "number" || typeof periodEnd !== "number") {
		console.log("Subscription data:", JSON.stringify(subscription, null, 2));
		throw new Error(
			`Invalid billing period: start=${periodStart}, end=${periodEnd}`,
		);
	}

	// When `interval` is supplied, align the billing period to that interval
	// using the sub's billing_cycle_anchor — Stripe inherits the parent sub's
	// period on every item regardless of price interval, so the raw
	// current_period_* values are wrong for cross-interval add-ons.
	let billingPeriod: { start: number; end: number };
	if (interval) {
		const anchorMs = secondsToMs(subscription.billing_cycle_anchor);
		const subCreatedMs = subscription.created
			? secondsToMs(subscription.created)
			: undefined;
		const nowMs = Date.now();

		billingPeriod = {
			start: getCycleStart({
				anchor: anchorMs,
				interval,
				intervalCount,
				now: nowMs,
				floor: subCreatedMs,
			}),
			end: getCycleEnd({
				anchor: anchorMs,
				interval,
				intervalCount,
				now: nowMs,
			}),
		};
	} else {
		billingPeriod = {
			start: periodStart * 1000,
			end: periodEnd * 1000,
		};
	}

	return {
		stripeCli,
		stripeCustomerId,
		subscription,
		billingPeriod,
	};
};

/**
 * Calculate prorated refund for the remaining billing period.
 */
export const calculateProratedRefund = async ({
	customerId,
	nowMs,
	amount,
}: {
	customerId: string;
	nowMs: number;
	amount: number;
}): Promise<number> => {
	const { billingPeriod } = await getStripeSubscription({ customerId });

	const prorated = applyProration({
		now: nowMs,
		billingPeriod,
		amount,
	});

	return -Number(prorated.toFixed(2));
};

/**
 * Calculate prorated charge for the remaining billing period.
 */
export const calculateProratedCharge = async ({
	customerId,
	nowMs,
	amount,
}: {
	customerId: string;
	nowMs: number;
	amount: number;
}): Promise<number> => {
	const { billingPeriod } = await getStripeSubscription({ customerId });

	return Number(
		applyProration({
			now: nowMs,
			billingPeriod,
			amount,
		}).toFixed(2),
	);
};

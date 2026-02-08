/**
 * Fetches billing period directly from Stripe subscription for proration calculations.
 *
 * Handles:
 * - Single subscription
 * - Multiple subscriptions (filter by interval)
 */

import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { CusService } from "@/internal/customers/CusService.js";

export type BillingPeriod = {
	start: number; // ms timestamp
	end: number; // ms timestamp
};

export type GetBillingPeriodParams = {
	customerId: string;
	interval?: "month" | "year";
};

export type GetBillingPeriodResult = {
	billingPeriod: BillingPeriod;
	billingAnchorMs: number; // Original subscription start (billing_cycle_anchor)
};

/**
 * Get billing period directly from Stripe subscription.
 *
 * @param customerId - The Autumn customer ID
 * @param interval - Optional: filter by billing interval ("month" or "year")
 *
 * @throws Error if no subscription found or billing period is missing
 *
 * @example
 * // Simple case - single subscription
 * const { billingPeriod, billingAnchorMs } = await getBillingPeriod({ customerId });
 *
 * @example
 * // Multi-interval - filter by billing interval
 * const { billingPeriod } = await getBillingPeriod({ customerId, interval: "month" });
 */
export const getBillingPeriod = async ({
	customerId,
	interval,
}: GetBillingPeriodParams): Promise<GetBillingPeriodResult> => {
	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });

	const fullCustomer = await CusService.getFull({
		db: ctx.db,
		idOrInternalId: customerId,
		orgId: ctx.org.id,
		env: ctx.env,
	});

	const stripeCustomerId =
		fullCustomer.processor?.id || fullCustomer.processor?.processor_id;

	if (!stripeCustomerId) {
		throw new Error(`Missing Stripe customer ID for customer "${customerId}"`);
	}

	const subscriptions = await stripeCli.subscriptions.list({
		customer: stripeCustomerId,
		status: "all",
	});

	if (subscriptions.data.length === 0) {
		throw new Error(`No subscriptions found for customer "${customerId}"`);
	}

	// Find an active subscription (not canceled)
	let matchingSubs = subscriptions.data.filter(
		(sub) => sub.status === "active" || sub.status === "trialing",
	);

	if (matchingSubs.length === 0) {
		matchingSubs = subscriptions.data;
	}

	// Filter by interval if specified
	if (interval) {
		const intervalSubs = matchingSubs.filter((sub) => {
			const firstItem = sub.items.data[0];
			if (!firstItem?.price?.recurring?.interval) return false;
			return firstItem.price.recurring.interval === interval;
		});

		if (intervalSubs.length === 0) {
			const availableIntervals = [
				...new Set(
					matchingSubs.map(
						(sub) => sub.items.data[0]?.price?.recurring?.interval ?? "unknown",
					),
				),
			];
			throw new Error(
				`No subscription with interval "${interval}" found. Available intervals: ${availableIntervals.join(", ")}`,
			);
		}

		matchingSubs = intervalSubs;
	}

	const subscription = matchingSubs[0];

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
		throw new Error(
			`Invalid billing period on subscription: start=${periodStart}, end=${periodEnd}`,
		);
	}

	return {
		billingPeriod: {
			start: periodStart * 1000,
			end: periodEnd * 1000,
		},
		billingAnchorMs: subscription.billing_cycle_anchor * 1000,
	};
};

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

	let billingPeriod: { start: number; end: number };
	if (interval) {
		const anchorMs = secondsToMs(subscription.billing_cycle_anchor);
		const nowMs = Date.now();

		billingPeriod = {
			start: getCycleStart({
				anchor: anchorMs,
				interval,
				intervalCount,
				now: nowMs,
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
